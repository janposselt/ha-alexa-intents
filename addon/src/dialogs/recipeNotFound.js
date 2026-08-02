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
    if (intentName !== 'MealPlanDialogRetryRecipe') {
      return {
        text: 'Bitte nenne das Rezept, das ich suchen soll, oder sage abbrechen.',
        endDialog: false,
        shouldEndSession: false,
      };
    }

    const recipeQuery = slots.receipt?.value;
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

  if (intentName !== 'MealPlanDialogChoice') {
    return {
      text: 'Bitte sage: Notiz erstellen, anderes Rezept suchen oder abbrechen.',
      endDialog: false,
      shouldEndSession: false,
    };
  }

  const action = normalizeAction(slots.choice?.value);
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
