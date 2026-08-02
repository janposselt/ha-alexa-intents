const mealie = require('../services/mealie');
const { formatDateISO, formatDateForSpeech } = require('../utils/date');
const { isNormalizedExactRecipeMatch } = require('../utils/recipeMatch');
const createRecipeDialog = require('./createRecipe');

const TYPE = 'recipe-not-found';

function getPrompt(state = {}) {
  if (state.phase === 'awaiting_recipe_confirmation' && state.pendingRecipeName) {
    return `Ich habe ${state.pendingRecipeName} gefunden. Soll ich das verwenden?`;
  }
  return 'Ich habe kein passendes Rezept gefunden. Möchtest du stattdessen eine Notiz erstellen, ein anderes Rezept suchen, ein neues Rezept erstellen oder abbrechen?';
}

async function handleTurn({ state, config, request }) {
  const intentName = request?.intent?.name;
  const slots = request?.intent?.slots || {};

  if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
    return {
      text: 'Okay, ich breche ab.',
      endDialog: true,
      shouldEndSession: true,
    };
  }

  if (state.phase === 'awaiting_recipe_confirmation') {
    const confirmationAction = resolveConfirmationAction(intentName, slots);
    if (confirmationAction === 'cancel') {
      return {
        text: 'Okay, ich breche ab.',
        endDialog: true,
        shouldEndSession: true,
      };
    }

    if (confirmationAction === 'yes' && state.pendingRecipeId && state.pendingRecipeName) {
      const date = new Date(state.dateIso);
      const dateLabel = formatDateForSpeech(date);
      await mealie.createMealPlan(config, date, state.pendingRecipeId, null);
      return {
        text: `Ich habe ${state.pendingRecipeName} für ${dateLabel} eingetragen.`,
        endDialog: true,
        shouldEndSession: true,
      };
    }

    if (confirmationAction === 'no') {
      return {
        text: 'Okay. Welches Rezept soll ich stattdessen suchen?',
        state: {
          ...state,
          phase: 'awaiting_recipe_query',
          pendingRecipeId: null,
          pendingRecipeName: null,
        },
        endDialog: false,
        shouldEndSession: false,
      };
    }

    return {
      text: `Ich habe ${state.pendingRecipeName} gefunden. Soll ich das verwenden? Bitte sage ja oder nein.`,
      endDialog: false,
      shouldEndSession: false,
    };
  }

  if (state.phase === 'awaiting_recipe_query') {
    const recipeQuery = extractBestSlotValue(slots, ['receipt', 'recipe', 'query']);
    const actionFromRecipeQuery = normalizeAction(recipeQuery, { strict: true });
    const explicitAction = actionFromRecipeQuery || (!recipeQuery ? resolveAction(intentName, slots) : null);

    if (explicitAction === 'cancel') {
      return {
        text: 'Okay, ich breche ab.',
        endDialog: true,
        shouldEndSession: true,
      };
    }

    if (explicitAction === 'note') {
      const date = new Date(state.dateIso);
      const dateLabel = formatDateForSpeech(date);
      await mealie.createMealPlan(config, date, null, state.originalQuery);
      return {
        text: `Ich habe "${state.originalQuery}" als Notiz für ${dateLabel} eingetragen.`,
        endDialog: true,
        shouldEndSession: true,
      };
    }

    if (explicitAction === 'retry') {
      return {
        text: 'Welches Rezept soll ich stattdessen suchen?',
        endDialog: false,
        shouldEndSession: false,
      };
    }

    if (explicitAction === 'create') {
      const recipeName = state.originalQuery;
      return {
        text: `Okay, wir erstellen "${recipeName}". Nenne die erste Zutat. Sage "Fertig" wenn du alle Zutaten genannt hast.`,
        endDialog: true,
        chainDialog: {
          type: createRecipeDialog.TYPE,
          state: createRecipeDialog.buildInitialState({ recipeName }),
        },
        shouldEndSession: false,
      };
    }

    if (!recipeQuery) {
      return {
        text: 'Ich habe den Rezeptnamen nicht verstanden. Bitte nenne ein anderes Rezept.',
        endDialog: false,
        shouldEndSession: false,
      };
    }

    const searchResult = await mealie.searchRecipes(config, recipeQuery);
    const recipes = Array.isArray(searchResult?.items) ? searchResult.items : [];
    const date = new Date(state.dateIso);
    const dateLabel = formatDateForSpeech(date);

    if (recipes.length > 0) {
      const recipe = recipes[0];
      if (!isNormalizedExactRecipeMatch(recipeQuery, recipe.name)) {
        return {
          text: `Ich habe ${recipe.name} gefunden. Soll ich das verwenden?`,
          state: {
            ...state,
            phase: 'awaiting_recipe_confirmation',
            pendingRecipeId: recipe.id,
            pendingRecipeName: recipe.name,
          },
          endDialog: false,
          shouldEndSession: false,
        };
      }
      await mealie.createMealPlan(config, date, recipe.id, null);
      return {
        text: `Ich habe ${recipe.name} für ${dateLabel} eingetragen.`,
        endDialog: true,
        shouldEndSession: true,
      };
    }

    return {
      text: 'Ich habe wieder kein passendes Rezept gefunden. Möchtest du eine Notiz erstellen, ein anderes Rezept suchen, ein neues Rezept erstellen oder abbrechen?',
      state: { ...state, phase: 'awaiting_choice' },
      endDialog: false,
      shouldEndSession: false,
    };
  }

  const action = resolveAction(intentName, slots);
  if (!action) {
    return {
      text: 'Bitte sage: Notiz erstellen, anderes Rezept suchen, neues Rezept erstellen oder abbrechen.',
      endDialog: false,
      shouldEndSession: false,
    };
  }

  if (action === 'cancel') {
    return {
      text: 'Okay, ich breche ab.',
      endDialog: true,
      shouldEndSession: true,
    };
  }

  if (action === 'retry') {
    return {
      text: 'Welches Rezept soll ich stattdessen suchen?',
      state: { ...state, phase: 'awaiting_recipe_query' },
      endDialog: false,
      shouldEndSession: false,
    };
  }

  if (action === 'create') {
    const recipeName = state.originalQuery;
    return {
      text: `Okay, wir erstellen "${recipeName}". Nenne die erste Zutat. Sage "Fertig" wenn du alle Zutaten genannt hast.`,
      endDialog: true,
      chainDialog: {
        type: createRecipeDialog.TYPE,
        state: createRecipeDialog.buildInitialState({ recipeName }),
      },
      shouldEndSession: false,
    };
  }

  const date = new Date(state.dateIso);
  const dateLabel = formatDateForSpeech(date);
  await mealie.createMealPlan(config, date, null, state.originalQuery);
  return {
    text: `Ich habe "${state.originalQuery}" als Notiz für ${dateLabel} eingetragen.`,
    endDialog: true,
    shouldEndSession: true,
  };
}

function normalizeAction(rawAction, options = {}) {
  const { strict = false } = options;
  const value = (rawAction || '').toLowerCase().trim();
  if (!value) {
    return null;
  }
  if (value.includes('abbruch') || value.includes('abbrechen') || value.includes('stopp') || value === 'stop') {
    return 'cancel';
  }
  if (value.includes('notiz')) {
    return 'note';
  }
  // Check retry BEFORE create so "neues Rezept suchen" is not mis-classified as 'create'.
  if (
    value.includes('anderes rezept')
    || value.includes('erneut suchen')
    || value.includes('neu suchen')
    || (value.includes('neues rezept') && value.includes('such'))
  ) {
    return 'retry';
  }
  if (!strict && value.includes('ander') && value.includes('rezept')) {
    return 'retry';
  }
  if (value.includes('neues rezept') || value.includes('rezept erstellen') || value.includes('rezept anlegen')) {
    return 'create';
  }
  return null;
}

/**
 * Returns the canonical resolved value for a slot when Alexa matched it to
 * a custom slot type value (ER_SUCCESS_MATCH). Falls back to null when the
 * slot has no resolution or the resolution did not match.
 *
 * @param {object} slot - Alexa slot object (may be undefined)
 * @returns {string|null}
 */
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

function extractBestSlotValue(slots, preferredNames = []) {
  for (const slotName of preferredNames) {
    const value = slots?.[slotName]?.value;
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

function resolveAction(intentName, slots) {
  // Map specific intent names directly to actions before inspecting slots.
  // This handles cases where Alexa routes a user utterance (e.g. "Rezept erstellen")
  // to a dedicated intent instead of MealPlanDialogChoice.
  if (intentName === 'CreateRecipe') {
    return 'create';
  }

  // For the choice slot, prefer the resolved canonical value (from Alexa's slot
  // resolution against MEALPLAN_DIALOG_ACTION) over the raw spoken value, because
  // Alexa normalises synonyms to the canonical form in resolutions even when the
  // spoken word doesn't match our keyword patterns.
  const choiceCanonical = getResolvedSlotValue(slots.choice);
  const choiceSpoken = slots.choice?.value;
  const actionFromChoice = normalizeAction(choiceCanonical) || normalizeAction(choiceSpoken);
  if (actionFromChoice) {
    return actionFromChoice;
  }

  const anySlotValue = extractBestSlotValue(slots);
  const actionFromAnySlot = normalizeAction(anySlotValue, { strict: true });
  if (actionFromAnySlot) {
    return actionFromAnySlot;
  }

  if (intentName === 'AMAZON.YesIntent') {
    return 'retry';
  }
  if (intentName === 'AMAZON.NoIntent') {
    return 'cancel';
  }
  return null;
}

function resolveConfirmationAction(intentName, slots) {
  if (intentName === 'AMAZON.YesIntent') {
    return 'yes';
  }
  if (intentName === 'AMAZON.NoIntent') {
    return 'no';
  }

  // Check canonical resolved value first, then spoken value
  const choiceCanonical = getResolvedSlotValue(slots.choice);
  const value = choiceCanonical || extractBestSlotValue(slots, ['choice', 'receipt', 'recipe', 'query']);
  const normalized = (value || '').toLowerCase().trim();
  if (!normalized) {
    return null;
  }
  if (normalized === 'ja' || normalized.startsWith('ja ')) {
    return 'yes';
  }
  if (normalized === 'nein' || normalized.startsWith('nein ')) {
    return 'no';
  }
  if (normalizeAction(normalized, { strict: true }) === 'retry') {
    return 'no';
  }
  if (normalizeAction(normalized, { strict: true }) === 'cancel') {
    return 'cancel';
  }
  return null;
}

function buildInitialState(date, originalQuery, pendingRecipe = null) {
  const initialState = {
    phase: 'awaiting_choice',
    dateIso: formatDateISO(date),
    originalQuery,
  };

  if (pendingRecipe?.id && pendingRecipe?.name) {
    initialState.phase = 'awaiting_recipe_confirmation';
    initialState.pendingRecipeId = pendingRecipe.id;
    initialState.pendingRecipeName = pendingRecipe.name;
  }

  return initialState;
}

module.exports = {
  TYPE,
  getPrompt,
  handleTurn,
  buildInitialState,
};
