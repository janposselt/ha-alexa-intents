/**
 * Shopping List Reader dialog.
 *
 * Reads the shopping list for 7 days starting from a given date.
 * For each day it announces the weekday and recipe name, then reads
 * ingredients one by one. The user must confirm each ingredient with "ok".
 * Notes are read as a single announcement. Empty days are announced and
 * the user confirms with "ok" before moving on.
 *
 * Phases:
 *   reading    – at a specific ingredient / note / empty-day prompt, waiting for "ok"
 *   done       – all days processed
 */

const mealie = require('../services/mealie');
const { parseLocalDateString, formatDateISO } = require('../utils/date');

const WEEKDAY_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const NUM_DAYS = 7;
const TYPE = 'shopping-list-reader';

// ── Prompt builder ─────────────────────────────────────────────────────────────

function getPrompt(state) {
  return state.currentText || 'Die Einkaufsliste ist leer.';
}

// ── Main turn handler ──────────────────────────────────────────────────────────

async function handleTurn({ state, config, request }) {
  const intentName = request?.intent?.name;
  const slots = request?.intent?.slots || {};

  // Stop / cancel at any time
  if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
    return { text: 'Einkaufsliste beendet. Auf Wiedersehen!', endDialog: true, shouldEndSession: true };
  }

  // User confirms ("ok", "weiter", "ja", "nächste", …)
  if (!isConfirmation(intentName, slots)) {
    return {
      text: `${state.currentText} Bitte sage "ok" oder "weiter" um fortzufahren.`,
      endDialog: false,
      shouldEndSession: false,
    };
  }

  return advance(state, config);
}

// ── Advance pointer ────────────────────────────────────────────────────────────

/**
 * Advances the reading position by one step and returns the next turn.
 */
async function advance(state, config) {
  const { dateIndex, dates, items, itemIndex, ingredients, ingredientIndex } = state;

  // More ingredients for current item?
  const nextIngredientIndex = ingredientIndex + 1;
  if (ingredients && nextIngredientIndex < ingredients.length) {
    const ingText = getIngredientText(ingredients[nextIngredientIndex]);
    const text = `Nächste Zutat: ${ingText}.`;
    return {
      text,
      state: { ...state, ingredientIndex: nextIngredientIndex, currentText: text },
      endDialog: false,
      shouldEndSession: false,
    };
  }

  // More items for current day?
  const nextItemIndex = itemIndex + 1;
  if (items && nextItemIndex < items.length) {
    return loadItem(state, config, nextItemIndex);
  }

  // Advance to next day
  return loadDay(state, config, dateIndex + 1);
}

// ── Load a specific item ───────────────────────────────────────────────────────

async function loadItem(state, config, targetItemIndex) {
  const { dates, dateIndex, items } = state;
  const item = items[targetItemIndex];

  const date = parseLocalDateString(dates[dateIndex]);
  const weekday = WEEKDAY_DE[date.getDay()];
  const isFirstItem = targetItemIndex === 0;
  const dayPrefix = isFirstItem ? `Am ${weekday}` : '';

  // Note item (no recipe)
  if (!item?.recipe) {
    const title = item?.title || 'Notiz';
    const text = isFirstItem
      ? `${dayPrefix} steht als Notiz: ${title}.`
      : `Außerdem Notiz: ${title}.`;
    return {
      text,
      state: { ...state, itemIndex: targetItemIndex, ingredients: [], ingredientIndex: -1, currentText: text },
      endDialog: false,
      shouldEndSession: false,
    };
  }

  // Recipe item – fetch full recipe for ingredients
  const recipeName = item.recipe.name || 'unbekanntes Gericht';
  let ingredients = [];
  try {
    const slug = item.recipe.slug || item.recipe.id;
    if (slug) {
      const fullRecipe = await mealie.getRecipe(config, slug);
      ingredients = extractIngredients(fullRecipe);
    }
  } catch (err) {
    console.error('[shoppingListReader] Error fetching recipe:', err.message);
  }

  if (ingredients.length === 0) {
    const text = isFirstItem
      ? `${dayPrefix} gibt es ${recipeName}. Keine Zutaten hinterlegt.`
      : `Außerdem ${recipeName}. Keine Zutaten hinterlegt.`;
    return {
      text,
      state: { ...state, itemIndex: targetItemIndex, ingredients: [], ingredientIndex: -1, currentText: text },
      endDialog: false,
      shouldEndSession: false,
    };
  }

  const firstIngredient = getIngredientText(ingredients[0]);
  const text = isFirstItem
    ? `${dayPrefix} gibt es ${recipeName}. Erste Zutat: ${firstIngredient}.`
    : `Außerdem ${recipeName}. Erste Zutat: ${firstIngredient}.`;

  return {
    text,
    state: { ...state, itemIndex: targetItemIndex, ingredients, ingredientIndex: 0, currentText: text },
    endDialog: false,
    shouldEndSession: false,
  };
}

// ── Load a specific day ────────────────────────────────────────────────────────

async function loadDay(state, config, targetDateIndex) {
  if (targetDateIndex >= state.dates.length) {
    const text = 'Die Einkaufsliste ist vollständig vorgelesen. Auf Wiedersehen!';
    return { text, endDialog: true, shouldEndSession: true };
  }

  const dateIso = state.dates[targetDateIndex];
  const date = parseLocalDateString(dateIso);
  const weekday = WEEKDAY_DE[date.getDay()];

  let items = [];
  try {
    const mealPlan = await mealie.getMealPlan(config, date);
    items = Array.isArray(mealPlan?.items) ? mealPlan.items : [];
  } catch (err) {
    console.error('[shoppingListReader] Error fetching meal plan:', err.message);
  }

  const newState = {
    ...state,
    dateIndex: targetDateIndex,
    items,
    itemIndex: -1,
    ingredients: [],
    ingredientIndex: -1,
  };

  if (items.length === 0) {
    const text = `Am ${weekday} ist nichts eingetragen.`;
    return {
      text,
      state: { ...newState, currentText: text },
      endDialog: false,
      shouldEndSession: false,
    };
  }

  return loadItem(newState, config, 0);
}

// ── Ingredient helpers ─────────────────────────────────────────────────────────

function extractIngredients(recipe) {
  if (!Array.isArray(recipe?.recipe_ingredient)) {
    return [];
  }
  return recipe.recipe_ingredient.filter((ing) => {
    const text = getIngredientText(ing);
    return text && text !== 'Zutat';
  });
}

function getIngredientText(ingredient) {
  if (!ingredient) {
    return 'Zutat';
  }
  return ingredient.display || ingredient.original_text || ingredient.note || ingredient.food?.name || 'Zutat';
}

// ── Confirmation detection ─────────────────────────────────────────────────────

function isConfirmation(intentName, slots) {
  if (
    intentName === 'AMAZON.YesIntent'
    || intentName === 'AMAZON.NextIntent'
  ) {
    return true;
  }

  const allSlotValues = Object.values(slots || {}).map((s) => (s?.value || '').toLowerCase().trim());
  for (const val of allSlotValues) {
    if (!val) {
      continue;
    }
    if (
      val === 'ok'
      || val === 'weiter'
      || val === 'ja'
      || val === 'nächste'
      || val === 'nächste zutat'
      || val === 'weiter'
      || val === 'bestätigen'
    ) {
      return true;
    }
  }

  return false;
}

// ── Initial state builder ──────────────────────────────────────────────────────

/**
 * @param {Date} startDate
 * @param {Array} firstDayItems - meal plan items for the first day (already loaded)
 * @param {string} firstItemText - text to speak for the very first turn
 * @param {Array} firstItemIngredients - ingredients for the first recipe item (already loaded)
 * @returns {object}
 */
function buildInitialState(startDate, firstDayItems, firstItemText, firstItemIngredients) {
  const dates = [];
  for (let i = 0; i < NUM_DAYS; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    dates.push(formatDateISO(d));
  }

  return {
    phase: 'reading',
    dates,
    dateIndex: 0,
    items: firstDayItems,
    itemIndex: firstItemIngredients !== null ? 0 : -1,
    ingredients: firstItemIngredients || [],
    ingredientIndex: firstItemIngredients && firstItemIngredients.length > 0 ? 0 : -1,
    currentText: firstItemText,
  };
}

module.exports = {
  TYPE,
  getPrompt,
  handleTurn,
  buildInitialState,
  loadDay,
  loadItem,
  getIngredientText,
  extractIngredients,
};
