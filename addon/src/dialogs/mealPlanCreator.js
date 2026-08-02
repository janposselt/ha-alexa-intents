/**
 * Meal Plan Creator dialog.
 *
 * Multi-turn dialog that walks the user through planning 7 days of meals
 * starting from a given date. Changes are held in memory and only written
 * to Mealie when the user explicitly says "speichern" / "beenden".
 *
 * Phases:
 *   day_existing        – day has existing entries; ask what to do with them
 *   day_input           – ask for a recipe/note for the current day
 *   day_confirm_recipe  – fuzzy recipe match found; ask for confirmation
 *   day_no_match        – no recipe found; offer note/retry/create/skip
 *   day_retry_recipe    – ask for a different recipe name
 *   create_name         – collecting new recipe name
 *   create_ingredients  – collecting new recipe ingredients
 *   all_done            – all days planned; offer save/cancel
 */

const mealie = require('../services/mealie');
const { formatDateISO, parseLocalDateString } = require('../utils/date');
const { isNormalizedExactRecipeMatch } = require('../utils/recipeMatch');
const { mealPlanItemLabels } = require('../utils/mealPlan');

const WEEKDAY_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const NUM_DAYS = 7;
const TYPE = 'meal-plan-creator';

// ── Prompt builder ─────────────────────────────────────────────────────────────

function getPrompt(state) {
  return buildPromptForState(state);
}

function buildPromptForState(state) {
  const { phase, dayIndex, dates, existingItems } = state;

  if (phase === 'all_done') {
    return 'Alle Tage geplant! Sage "speichern" um den Essensplan zu speichern oder "abbrechen" um alle Änderungen zu verwerfen.';
  }

  const dateIso = dates[dayIndex];
  const date = parseLocalDateString(dateIso);
  const weekday = WEEKDAY_DE[date.getDay()];

  if (phase === 'day_existing') {
    const labels = mealPlanItemLabels(existingItems);
    const existing = labels.length > 0 ? labels.join(' und ') : 'etwas';
    return (
      `Am ${weekday} ist bereits ${existing} eingetragen. `
      + 'Sage "weiter" für den nächsten Tag, "ersetzen" um es zu ersetzen, '
      + '"hinzufügen" um noch etwas hinzuzufügen, '
      + '"speichern" um den Plan zu speichern oder "abbrechen".'
    );
  }

  if (phase === 'day_confirm_recipe') {
    return `Ich habe "${state.pendingRecipeName}" gefunden. Soll ich das für ${weekday} verwenden?`;
  }

  if (phase === 'day_no_match') {
    return (
      `Ich habe kein passendes Rezept für "${state.searchQuery}" gefunden. `
      + 'Sage "Notiz" um es als Notiz einzutragen, "anderes Rezept suchen", '
      + '"neues Rezept erstellen", "überspringen" für diesen Tag oder "abbrechen".'
    );
  }

  if (phase === 'day_retry_recipe') {
    return 'Welches Rezept soll ich stattdessen suchen?';
  }

  if (phase === 'create_name') {
    return 'Wie soll das neue Rezept heißen?';
  }

  if (phase === 'create_ingredients') {
    const name = state.newRecipeName || 'dem neuen Rezept';
    if (!state.newRecipeIngredients || state.newRecipeIngredients.length === 0) {
      return `Okay, wir erstellen "${name}". Nenne die erste Zutat oder sage "Fertig" wenn du keine Zutaten möchtest.`;
    }
    return 'Nenne die nächste Zutat oder sage "Fertig" wenn du fertig bist.';
  }

  // day_input
  return (
    `Was soll es am ${weekday} geben? `
    + 'Nenne ein Rezept, sage "neues Rezept" um ein neues zu erstellen, '
    + '"überspringen" für diesen Tag, "speichern" um den Plan zu speichern oder "abbrechen".'
  );
}

// ── Main turn handler ──────────────────────────────────────────────────────────

async function handleTurn({ state, config, request }) {
  const intentName = request?.intent?.name;
  const slots = request?.intent?.slots || {};

  if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
    return cancelDialog();
  }

  const { phase } = state;

  if (phase === 'all_done') {
    return handleAllDonePhase(state, config, intentName, slots);
  }

  if (phase === 'day_existing') {
    return handleDayExistingPhase(state, config, intentName, slots);
  }

  if (phase === 'day_input' || phase === 'day_retry_recipe') {
    return handleDayInputPhase(state, config, intentName, slots);
  }

  if (phase === 'day_confirm_recipe') {
    return handleDayConfirmPhase(state, config, intentName, slots);
  }

  if (phase === 'day_no_match') {
    return handleDayNoMatchPhase(state, config, intentName, slots);
  }

  if (phase === 'create_name') {
    return handleCreateNamePhase(state, config, intentName, slots);
  }

  if (phase === 'create_ingredients') {
    return handleCreateIngredientsPhase(state, config, intentName, slots);
  }

  return { text: buildPromptForState(state), endDialog: false, shouldEndSession: false };
}

// ── Phase handlers ─────────────────────────────────────────────────────────────

function handleAllDonePhase(state, config, intentName, slots) {
  const action = recognizeAction(extractInputText(slots), intentName);
  if (action === 'save' || intentName === 'AMAZON.YesIntent') {
    return saveAndEnd(state, config);
  }
  if (action === 'cancel' || intentName === 'AMAZON.NoIntent') {
    return cancelDialog();
  }
  return {
    text: 'Sage "speichern" um den Essensplan zu speichern oder "abbrechen" um alle Änderungen zu verwerfen.',
    endDialog: false,
    shouldEndSession: false,
  };
}

async function handleDayExistingPhase(state, config, intentName, slots) {
  const action = recognizeAction(extractInputText(slots), intentName);

  if (action === 'cancel') {
    return cancelDialog();
  }
  if (action === 'save') {
    return saveAndEnd(state, config);
  }

  // "weiter" / "nächster Tag" – keep existing, advance
  if (action === 'next' || intentName === 'AMAZON.YesIntent') {
    return advanceToNextDay(state, config);
  }

  // "ersetzen" – mark existing for deletion, go to day_input
  if (action === 'replace') {
    const deletes = [
      ...state.pendingDeletes,
      ...state.existingItems.filter((i) => i?.id).map((i) => ({ itemId: i.id })),
    ];
    const newState = { ...state, phase: 'day_input', existingItems: [], pendingDeletes: deletes };
    return {
      text: buildPromptForState(newState),
      state: newState,
      endDialog: false,
      shouldEndSession: false,
    };
  }

  // "hinzufügen" / "behalten und hinzufügen" – keep existing, also allow new entry
  if (action === 'add') {
    const newState = { ...state, phase: 'day_input' };
    return {
      text: buildPromptForState(newState),
      state: newState,
      endDialog: false,
      shouldEndSession: false,
    };
  }

  return {
    text: buildPromptForState(state),
    endDialog: false,
    shouldEndSession: false,
  };
}

async function handleDayInputPhase(state, config, intentName, slots) {
  const inputText = extractInputText(slots);
  const action = recognizeAction(inputText, intentName);

  if (action === 'cancel') {
    return cancelDialog();
  }
  if (action === 'save') {
    return saveAndEnd(state, config);
  }
  if (action === 'skip' || action === 'next') {
    return advanceToNextDay(state, config);
  }
  if (action === 'create_recipe' || intentName === 'CreateRecipe') {
    const newState = { ...state, phase: 'create_name', newRecipeName: null, newRecipeIngredients: [] };
    return { text: buildPromptForState(newState), state: newState, endDialog: false, shouldEndSession: false };
  }

  if (!inputText) {
    return { text: buildPromptForState(state), endDialog: false, shouldEndSession: false };
  }

  // Search for recipe
  const searchResult = await mealie.searchRecipes(config, inputText);
  const recipes = Array.isArray(searchResult?.items) ? searchResult.items : [];

  if (recipes.length === 0) {
    const newState = { ...state, phase: 'day_no_match', searchQuery: inputText };
    return { text: buildPromptForState(newState), state: newState, endDialog: false, shouldEndSession: false };
  }

  const recipe = recipes[0];
  if (isNormalizedExactRecipeMatch(inputText, recipe.name)) {
    const updatedEntries = addRecipeEntry(state, recipe);
    return advanceToNextDay({ ...state, pendingEntries: updatedEntries }, config);
  }

  // Fuzzy match – ask for confirmation
  const newState = { ...state, phase: 'day_confirm_recipe', searchQuery: inputText, pendingRecipeId: recipe.id, pendingRecipeName: recipe.name };
  return { text: buildPromptForState(newState), state: newState, endDialog: false, shouldEndSession: false };
}

async function handleDayConfirmPhase(state, config, intentName, slots) {
  const inputText = extractInputText(slots);
  const action = recognizeAction(inputText, intentName);

  if (action === 'cancel') {
    return cancelDialog();
  }
  if (action === 'save') {
    return saveAndEnd(state, config);
  }

  const confirmation = resolveYesNo(intentName, inputText);
  if (confirmation === 'yes') {
    const updatedEntries = addRecipeEntry(state, { id: state.pendingRecipeId, name: state.pendingRecipeName });
    return advanceToNextDay({ ...state, pendingEntries: updatedEntries }, config);
  }
  if (confirmation === 'no') {
    const newState = { ...state, phase: 'day_input', pendingRecipeId: null, pendingRecipeName: null };
    return { text: buildPromptForState(newState), state: newState, endDialog: false, shouldEndSession: false };
  }

  const weekday = getWeekdayLabel(state);
  return {
    text: `Soll ich "${state.pendingRecipeName}" für ${weekday} verwenden? Bitte sage ja oder nein.`,
    endDialog: false,
    shouldEndSession: false,
  };
}

async function handleDayNoMatchPhase(state, config, intentName, slots) {
  const inputText = extractInputText(slots);
  const action = recognizeAction(inputText, intentName);

  if (action === 'cancel') {
    return cancelDialog();
  }
  if (action === 'save') {
    return saveAndEnd(state, config);
  }
  if (action === 'skip' || action === 'next') {
    return advanceToNextDay(state, config);
  }
  if (action === 'note') {
    const dateIso = state.dates[state.dayIndex];
    const updatedEntries = [...state.pendingEntries, { dateIso, title: state.searchQuery }];
    return advanceToNextDay({ ...state, pendingEntries: updatedEntries }, config);
  }
  if (action === 'retry') {
    const newState = { ...state, phase: 'day_retry_recipe' };
    return { text: buildPromptForState(newState), state: newState, endDialog: false, shouldEndSession: false };
  }
  if (action === 'create_recipe' || intentName === 'CreateRecipe') {
    const newState = { ...state, phase: 'create_name', newRecipeName: state.searchQuery, newRecipeIngredients: [] };
    return { text: buildPromptForState(newState), state: newState, endDialog: false, shouldEndSession: false };
  }

  return { text: buildPromptForState(state), endDialog: false, shouldEndSession: false };
}

async function handleCreateNamePhase(state, config, intentName, slots) {
  const inputText = extractInputText(slots);
  const action = recognizeAction(inputText, intentName);

  if (action === 'cancel') {
    return cancelDialog();
  }
  if (!inputText) {
    return { text: 'Ich habe den Namen nicht verstanden. Wie soll das Rezept heißen?', endDialog: false, shouldEndSession: false };
  }

  // Check if recipe already exists
  try {
    const searchResult = await mealie.searchRecipes(config, inputText);
    const recipes = Array.isArray(searchResult?.items) ? searchResult.items : [];
    if (recipes.some((r) => isNormalizedExactRecipeMatch(inputText, r.name))) {
      return {
        text: `Ein Rezept namens "${inputText}" existiert bereits. Bitte wähle einen anderen Namen.`,
        endDialog: false,
        shouldEndSession: false,
      };
    }
  } catch {
    // Ignore search errors
  }

  const newState = { ...state, phase: 'create_ingredients', newRecipeName: inputText, newRecipeIngredients: [] };
  return { text: buildPromptForState(newState), state: newState, endDialog: false, shouldEndSession: false };
}

async function handleCreateIngredientsPhase(state, config, intentName, slots) {
  const inputText = extractInputText(slots);
  const action = recognizeAction(inputText, intentName);

  if (action === 'cancel') {
    return cancelDialog();
  }
  if (action === 'correct') {
    const ingredients = state.newRecipeIngredients || [];
    if (ingredients.length === 0) {
      return { text: 'Es gibt noch keine Zutaten. Nenne die erste Zutat.', endDialog: false, shouldEndSession: false };
    }
    const removed = ingredients[ingredients.length - 1];
    const updated = ingredients.slice(0, -1);
    return {
      text: `"${removed}" entfernt. Nenne die Zutat erneut oder sage "Fertig".`,
      state: { ...state, newRecipeIngredients: updated },
      endDialog: false,
      shouldEndSession: false,
    };
  }

  if (action === 'done' || action === 'save') {
    return createRecipeAndAddToDay(state, config);
  }

  if (!inputText) {
    return { text: 'Ich habe die Zutat nicht verstanden. Bitte wiederhole sie oder sage "Fertig".', endDialog: false, shouldEndSession: false };
  }

  const updatedIngredients = [...(state.newRecipeIngredients || []), inputText];
  return {
    text: `"${inputText}" hinzugefügt. Nenne die nächste Zutat oder sage "Fertig".`,
    state: { ...state, newRecipeIngredients: updatedIngredients },
    endDialog: false,
    shouldEndSession: false,
  };
}

// ── Recipe creation helper ─────────────────────────────────────────────────────

async function createRecipeAndAddToDay(state, config) {
  const { newRecipeName, newRecipeIngredients = [] } = state;

  try {
    const { recipeId } = await mealie.createRecipeWithIngredients(config, newRecipeName, newRecipeIngredients);

    const ingredientHint = newRecipeIngredients.length > 0
      ? ` mit ${newRecipeIngredients.length} Zutat${newRecipeIngredients.length === 1 ? '' : 'en'}`
      : '';

    const dateIso = state.dates[state.dayIndex];
    const updatedEntries = [
      ...state.pendingEntries,
      { dateIso, recipeId, recipeName: newRecipeName },
    ];

    const cleanState = {
      ...state,
      pendingEntries: updatedEntries,
      newRecipeName: null,
      newRecipeIngredients: [],
    };

    const advance = await advanceToNextDay(cleanState, config);
    return {
      ...advance,
      text: `Rezept "${newRecipeName}"${ingredientHint} erstellt und für diesen Tag eingetragen. ${advance.text}`,
    };
  } catch (err) {
    console.error('[mealPlanCreator] Error creating recipe:', err.message);
    return {
      text: 'Beim Erstellen des Rezepts ist ein Fehler aufgetreten. Sage erneut "Fertig" oder "Abbrechen".',
      endDialog: false,
      shouldEndSession: false,
    };
  }
}

// ── Save & advance helpers ─────────────────────────────────────────────────────

async function saveAndEnd(state, config) {
  const { pendingDeletes = [], pendingEntries = [] } = state;
  let savedCount = 0;
  let errorCount = 0;

  for (const del of pendingDeletes) {
    try {
      await mealie.deleteMealPlanEntry(config, del.itemId);
    } catch (err) {
      console.error('[mealPlanCreator] Error deleting entry:', del.itemId, err.message);
      errorCount++;
    }
  }

  for (const entry of pendingEntries) {
    try {
      const date = parseLocalDateString(entry.dateIso);
      await mealie.createMealPlan(config, date, entry.recipeId || null, entry.title || null);
      savedCount++;
    } catch (err) {
      console.error('[mealPlanCreator] Error saving entry:', entry, err.message);
      errorCount++;
    }
  }

  let text;
  if (savedCount === 0 && pendingEntries.length === 0) {
    text = 'Essensplan abgeschlossen. Keine neuen Einträge hinzugefügt.';
  } else if (errorCount > 0) {
    text = `Essensplan gespeichert. ${savedCount} ${savedCount === 1 ? 'Eintrag' : 'Einträge'} hinzugefügt, ${errorCount} Fehler aufgetreten.`;
  } else {
    text = `Essensplan gespeichert! ${savedCount} ${savedCount === 1 ? 'Eintrag' : 'Einträge'} hinzugefügt.`;
  }

  return { text, endDialog: true, shouldEndSession: true };
}

function cancelDialog() {
  return {
    text: 'Essensplanung abgebrochen. Keine Änderungen gespeichert.',
    endDialog: true,
    shouldEndSession: true,
  };
}

async function advanceToNextDay(state, config) {
  const nextIndex = state.dayIndex + 1;

  if (nextIndex >= state.dates.length) {
    const newState = { ...state, phase: 'all_done', dayIndex: nextIndex };
    return {
      text: buildPromptForState(newState),
      state: newState,
      endDialog: false,
      shouldEndSession: false,
    };
  }

  const nextDateIso = state.dates[nextIndex];
  const nextDate = parseLocalDateString(nextDateIso);
  const existingItems = await loadExistingItems(config, nextDate);

  const newState = {
    ...state,
    dayIndex: nextIndex,
    existingItems,
    phase: existingItems.length > 0 ? 'day_existing' : 'day_input',
    searchQuery: null,
    pendingRecipeId: null,
    pendingRecipeName: null,
    newRecipeName: null,
    newRecipeIngredients: [],
  };

  return { text: buildPromptForState(newState), state: newState, endDialog: false, shouldEndSession: false };
}

async function loadExistingItems(config, date) {
  try {
    const mealPlan = await mealie.getMealPlan(config, date);
    return Array.isArray(mealPlan?.items) ? mealPlan.items : [];
  } catch {
    return [];
  }
}

function addRecipeEntry(state, recipe) {
  return [
    ...state.pendingEntries,
    { dateIso: state.dates[state.dayIndex], recipeId: recipe.id, recipeName: recipe.name },
  ];
}

// ── Input parsing helpers ──────────────────────────────────────────────────────

function recognizeAction(text, intentName) {
  const val = (text || '').toLowerCase().trim();

  if (val.includes('abbruch') || val.includes('abbrechen') || val.includes('stopp') || val === 'stop') {
    return 'cancel';
  }

  // "Fertig" = done with ingredients (takes priority over save)
  if (
    val === 'fertig'
    || val.startsWith('fertig ')
    || val === 'das wars'
    || val.includes('keine weiteren zutaten')
    || val.includes('fertig mit zutaten')
  ) {
    return 'done';
  }

  // "Speichern" / "Beenden" = save the meal plan
  if (
    val.includes('speichern')
    || val.includes('beenden')
    || val.includes('bin fertig')
    || val.includes('ich bin fertig')
    || val.includes('alle fertig')
  ) {
    return 'save';
  }

  if (
    val === 'weiter'
    || val === 'nächster tag'
    || val === 'nächste tag'
    || val === 'überspringen'
    || val === 'skip'
    || val.includes('zum nächsten tag')
    || val.includes('nächsten tag')
  ) {
    return val === 'überspringen' || val === 'skip' ? 'skip' : 'next';
  }
  if (val === 'ersetzen' || val.includes('ersetzen') || val.includes('löschen') || val.includes('ändern')) {
    return 'replace';
  }
  if (val === 'hinzufügen' || val.includes('hinzufügen') || val.includes('behalten und') || val.includes('noch etwas')) {
    return 'add';
  }
  if (val.includes('notiz')) {
    return 'note';
  }
  if (
    val.includes('anderes rezept')
    || val.includes('erneut suchen')
    || val.includes('neu suchen')
    || (val.includes('neues rezept') && val.includes('such'))
  ) {
    return 'retry';
  }
  if (!val.includes('such') && (val.includes('neues rezept') || val.includes('rezept erstellen') || val.includes('rezept anlegen'))) {
    return 'create_recipe';
  }
  if (
    val.includes('korrigier')
    || val.includes('rückgängig')
    || val === 'undo'
    || val.includes('letzte zutat')
    || val.includes('letzte eingabe')
  ) {
    return 'correct';
  }

  // Intent-based fallback
  if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
    return 'cancel';
  }

  return null;
}

function resolveYesNo(intentName, text) {
  if (intentName === 'AMAZON.YesIntent') {
    return 'yes';
  }
  if (intentName === 'AMAZON.NoIntent') {
    return 'no';
  }
  const val = (text || '').toLowerCase().trim();
  if (val === 'ja' || val.startsWith('ja ')) {
    return 'yes';
  }
  if (val === 'nein' || val.startsWith('nein ')) {
    return 'no';
  }
  return null;
}

function extractInputText(slots) {
  const preferred = ['query', 'receipt', 'recipe', 'choice'];
  for (const name of preferred) {
    const canonical = getResolvedSlotValue(slots?.[name]);
    if (canonical && !recognizeAction(canonical, null)) {
      return canonical;
    }
    const value = slots?.[name]?.value;
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  for (const slot of Object.values(slots || {})) {
    const value = slot?.value;
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getResolvedSlotValue(slot) {
  const authorities = slot?.resolutions?.resolutionsPerAuthority;
  if (!Array.isArray(authorities)) {
    return null;
  }
  for (const authority of authorities) {
    if (authority?.status?.code === 'ER_SUCCESS_MATCH') {
      return authority.values?.[0]?.value?.name ?? null;
    }
  }
  return null;
}

function getWeekdayLabel(state) {
  const dateIso = state.dates[state.dayIndex];
  const date = parseLocalDateString(dateIso);
  return WEEKDAY_DE[date.getDay()];
}

// ── Initial state builder ──────────────────────────────────────────────────────

/**
 * Builds the initial dialog state.
 *
 * @param {Date} startDate
 * @param {Array} existingItemsForFirstDay - already-loaded meal plan items for day 0
 * @returns {object}
 */
function buildInitialState(startDate, existingItemsForFirstDay = []) {
  const dates = [];
  for (let i = 0; i < NUM_DAYS; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    dates.push(formatDateISO(d));
  }

  return {
    phase: existingItemsForFirstDay.length > 0 ? 'day_existing' : 'day_input',
    dayIndex: 0,
    dates,
    existingItems: existingItemsForFirstDay,
    pendingEntries: [],
    pendingDeletes: [],
    searchQuery: null,
    pendingRecipeId: null,
    pendingRecipeName: null,
    newRecipeName: null,
    newRecipeIngredients: [],
  };
}

module.exports = {
  TYPE,
  getPrompt,
  handleTurn,
  buildInitialState,
};
