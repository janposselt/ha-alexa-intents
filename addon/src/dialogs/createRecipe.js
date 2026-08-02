const mealie = require('../services/mealie');
const { normalizeRecipeText, isNormalizedExactRecipeMatch } = require('../utils/recipeMatch');

const TYPE = 'create-recipe';

function getPrompt(state = {}) {
  if (state.phase === 'awaiting_ingredients') {
    const name = state.recipeName || 'dem neuen Rezept';
    if (!state.ingredients || state.ingredients.length === 0) {
      return `Okay, nenne die erste Zutat für ${name}. Sage "Fertig" wenn du alle Zutaten genannt hast.`;
    }
    return `Verstanden. Nenne die nächste Zutat, oder sage "Fertig" wenn du fertig bist.`;
  }
  return 'Wie soll das neue Rezept heißen?';
}

async function handleTurn({ state, config, request }) {
  const intentName = request?.intent?.name;
  const slots = request?.intent?.slots || {};

  if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
    return {
      text: 'Okay, ich breche das Erstellen des Rezepts ab.',
      endDialog: true,
      shouldEndSession: true,
    };
  }

  const inputText = extractInputText(slots);

  if (state.phase === 'awaiting_name') {
    return handleNamePhase(state, config, inputText);
  }

  if (state.phase === 'awaiting_ingredients') {
    return handleIngredientsPhase(state, config, inputText);
  }

  return {
    text: 'Wie soll das neue Rezept heißen?',
    endDialog: false,
    shouldEndSession: false,
  };
}

async function handleNamePhase(state, config, inputText) {
  if (!inputText) {
    return {
      text: 'Ich habe den Namen nicht verstanden. Wie soll das Rezept heißen?',
      endDialog: false,
      shouldEndSession: false,
    };
  }

  const action = normalizeAction(inputText);
  if (action === 'cancel') {
    return {
      text: 'Okay, ich breche das Erstellen des Rezepts ab.',
      endDialog: true,
      shouldEndSession: true,
    };
  }

  // Check if recipe with this normalized name already exists
  try {
    const searchResult = await mealie.searchRecipes(config, inputText);
    const recipes = Array.isArray(searchResult?.items) ? searchResult.items : [];
    const alreadyExists = recipes.some((r) => isNormalizedExactRecipeMatch(inputText, r.name));
    if (alreadyExists) {
      return {
        text: `Ein Rezept mit dem Namen "${inputText}" existiert bereits. Bitte wähle einen anderen Namen.`,
        endDialog: false,
        shouldEndSession: false,
      };
    }
  } catch {
    // Ignore search errors – proceed with creation
  }

  return {
    text: `Okay, wir erstellen "${inputText}". Nenne die erste Zutat. Sage "Fertig" wenn du alle Zutaten genannt hast.`,
    state: {
      ...state,
      phase: 'awaiting_ingredients',
      recipeName: inputText,
      ingredients: [],
    },
    endDialog: false,
    shouldEndSession: false,
  };
}

async function handleIngredientsPhase(state, config, inputText) {
  const action = inputText ? normalizeAction(inputText) : null;

  if (action === 'cancel') {
    return {
      text: 'Okay, ich breche das Erstellen des Rezepts ab.',
      endDialog: true,
      shouldEndSession: true,
    };
  }

  if (action === 'correct') {
    const ingredients = state.ingredients || [];
    if (ingredients.length === 0) {
      return {
        text: 'Es gibt noch keine Zutaten zum Korrigieren. Nenne die erste Zutat.',
        endDialog: false,
        shouldEndSession: false,
      };
    }
    const removed = ingredients[ingredients.length - 1];
    const updated = ingredients.slice(0, -1);
    return {
      text: `Ich habe "${removed}" entfernt. Nenne die Zutat erneut.`,
      state: { ...state, ingredients: updated },
      endDialog: false,
      shouldEndSession: false,
    };
  }

  if (action === 'done') {
    return finishRecipe(state, config);
  }

  if (!inputText) {
    return {
      text: 'Ich habe die Zutat nicht verstanden. Bitte wiederhole sie.',
      endDialog: false,
      shouldEndSession: false,
    };
  }

  const updatedIngredients = [...(state.ingredients || []), inputText];
  return {
    text: `"${inputText}" hinzugefügt. Nenne die nächste Zutat, oder sage "Fertig".`,
    state: { ...state, ingredients: updatedIngredients },
    endDialog: false,
    shouldEndSession: false,
  };
}

async function finishRecipe(state, config) {
  const { recipeName, ingredients = [] } = state;

  try {
    const slug = await mealie.createRecipe(config, recipeName);

    if (ingredients.length > 0) {
      const parsedIngredients = await Promise.all(
        ingredients.map((text) => mealie.parseIngredient(config, text)),
      );
      await mealie.updateRecipe(config, slug, { ingredients: parsedIngredients });
    }

    const ingredientHint = ingredients.length > 0
      ? ` mit ${ingredients.length} Zutat${ingredients.length === 1 ? '' : 'en'}`
      : '';
    return {
      text: `Das Rezept "${recipeName}"${ingredientHint} wurde angelegt. Die Zubereitungsschritte kannst du in der Mealie App bearbeiten.`,
      endDialog: true,
      shouldEndSession: true,
    };
  } catch (err) {
    console.error('[createRecipe] Error creating recipe:', err.message);
    return {
      text: 'Beim Anlegen des Rezepts ist ein Fehler aufgetreten. Bitte versuche es erneut.',
      endDialog: true,
      shouldEndSession: true,
    };
  }
}

function normalizeAction(text) {
  const value = (text || '').toLowerCase().trim();
  if (!value) {
    return null;
  }
  if (value === 'fertig' || value.startsWith('fertig ') || value === 'das wars' || value === 'bin fertig') {
    return 'done';
  }
  if (value.includes('abbruch') || value.includes('abbrechen') || value.includes('stopp') || value === 'stop') {
    return 'cancel';
  }
  if (value.includes('korrigier') || value.includes('rückgängig') || value === 'undo') {
    return 'correct';
  }
  return null;
}

function extractInputText(slots) {
  // Prefer the receipt/recipe SearchQuery slot, then any slot
  const preferred = ['receipt', 'recipe', 'query', 'choice'];
  for (const name of preferred) {
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

/**
 * Builds the initial state for the dialog.
 *
 * @param {object} options
 * @param {string} [options.recipeName]  - Pre-filled recipe name (skips name phase)
 * @returns {object}
 */
function buildInitialState({ recipeName } = {}) {
  if (recipeName) {
    return {
      phase: 'awaiting_ingredients',
      recipeName,
      ingredients: [],
    };
  }
  return {
    phase: 'awaiting_name',
    ingredients: [],
  };
}

module.exports = {
  TYPE,
  getPrompt,
  handleTurn,
  buildInitialState,
};
