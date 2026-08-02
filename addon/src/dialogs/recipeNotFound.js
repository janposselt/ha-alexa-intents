const mealie = require('../services/mealie');
const { formatDateISO, formatDateForSpeech } = require('../utils/date');

const TYPE = 'recipe-not-found';

function getPrompt() {
  return 'Ich habe kein passendes Rezept gefunden. Möchtest du stattdessen eine Notiz erstellen, ein anderes Rezept suchen oder abbrechen?';
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

  if (state.phase === 'awaiting_recipe_query') {
    const recipeQuery = extractBestSlotValue(slots, ['receipt', 'recipe', 'query']);
    const actionFromRecipeQuery = normalizeAction(recipeQuery);
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
      await mealie.createMealPlan(config, date, recipe.id, null);
      return {
        text: `Ich habe ${recipe.name} für ${dateLabel} eingetragen.`,
        endDialog: true,
        shouldEndSession: true,
      };
    }

    return {
      text: 'Ich habe wieder kein passendes Rezept gefunden. Möchtest du eine Notiz erstellen, ein anderes Rezept suchen oder abbrechen?',
      state: { ...state, phase: 'awaiting_choice' },
      endDialog: false,
      shouldEndSession: false,
    };
  }

  const action = resolveAction(intentName, slots);
  if (!action) {
    return {
      text: 'Bitte sage: Notiz erstellen, anderes Rezept suchen oder abbrechen.',
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

  const date = new Date(state.dateIso);
  const dateLabel = formatDateForSpeech(date);
  await mealie.createMealPlan(config, date, null, state.originalQuery);
  return {
    text: `Ich habe "${state.originalQuery}" als Notiz für ${dateLabel} eingetragen.`,
    endDialog: true,
    shouldEndSession: true,
  };
}

function normalizeAction(rawAction) {
  const value = (rawAction || '').toLowerCase().trim();
  if (!value) {
    return null;
  }
  if (value.includes('abbruch') || value.includes('abbrechen') || value.includes('stopp')) {
    return 'cancel';
  }
  if (value.includes('notiz')) {
    return 'note';
  }
  if (value.includes('ander') || value.includes('rezept')) {
    return 'retry';
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
  if (intentName === 'AMAZON.YesIntent') {
    return 'retry';
  }
  if (intentName === 'AMAZON.NoIntent') {
    return 'cancel';
  }
  if (intentName === 'MealPlanDialogRetryRecipe') {
    return 'retry';
  }

  const choiceValue = slots.choice?.value;
  const actionFromChoiceSlot = normalizeAction(choiceValue);
  if (actionFromChoiceSlot) {
    return actionFromChoiceSlot;
  }

  const anySlotValue = extractBestSlotValue(slots);
  return normalizeAction(anySlotValue);
}

function buildInitialState(date, originalQuery) {
  return {
    phase: 'awaiting_choice',
    dateIso: formatDateISO(date),
    originalQuery,
  };
}

module.exports = {
  TYPE,
  getPrompt,
  handleTurn,
  buildInitialState,
};
