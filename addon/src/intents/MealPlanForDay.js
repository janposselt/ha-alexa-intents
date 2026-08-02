/**
 * MealPlanForDay intent handler.
 *
 * Used for: MealPlanForMonday … MealPlanForSunday, MealPlanForToday, MealPlanForTomorrow.
 *
 * Slot: receipt – recipe name to search for (AMAZON.SearchQuery).
 *
 * Behavior:
 *  - Searches Mealie for the recipe name.
 *  - If a recipe is found with a sufficient match, sets it as the meal plan for the day.
 *  - If no recipe is found, creates a note for that day with the given text.
 *
 * Weekday rules:
 *  - The NEXT occurrence of the weekday is used.
 *  - If today IS the named weekday, it resolves to the same day NEXT week.
 */

const mealie = require('../services/mealie');
const { getTargetDate, formatDateForSpeech } = require('../utils/date');
const { isNormalizedExactRecipeMatch } = require('../utils/recipeMatch');
const dialogManager = require('../dialogs/manager');
const recipeNotFoundDialog = require('../dialogs/recipeNotFound');

/**
 * @param {string} dayIdentifier - 'today' | 'tomorrow' | lowercase weekday name | YYYY-MM-DD
 * @param {Record<string, { value: string }>} slots
 * @param {object} config
 * @returns {Promise<string>}
 */
async function handleMealPlanForDay(dayIdentifier, slots, config) {
  const recipeQuery = slots.receipt?.value;

  if (!recipeQuery) {
    return 'Was soll ich für diesen Tag eintragen? Bitte nenne ein Rezept oder eine Notiz.';
  }

  const date = getTargetDate(dayIdentifier);
  const dateLabel = formatDateForSpeech(date);

  const searchResult = await mealie.searchRecipes(config, recipeQuery);
  const recipes = Array.isArray(searchResult?.items) ? searchResult.items : [];
  const sessionId = config.__sessionId;

  if (recipes.length > 0) {
    const recipe = recipes[0];
    const isExactMatch = isNormalizedExactRecipeMatch(recipeQuery, recipe.name);

    if (!isExactMatch && sessionId) {
      return dialogManager.startDialog(
        sessionId,
        recipeNotFoundDialog.TYPE,
        recipeNotFoundDialog.buildInitialState(date, recipeQuery, {
          id: recipe.id,
          name: recipe.name,
        }),
      );
    }

    await mealie.createMealPlan(config, date, recipe.id, null);
    return `Ich habe ${recipe.name} für ${dateLabel} eingetragen.`;
  }

  if (!sessionId) {
    await mealie.createMealPlan(config, date, null, recipeQuery);
    return `Ich habe kein Rezept für "${recipeQuery}" gefunden und stattdessen eine Notiz für ${dateLabel} eingetragen.`;
  }

  return dialogManager.startDialog(
    sessionId,
    recipeNotFoundDialog.TYPE,
    recipeNotFoundDialog.buildInitialState(date, recipeQuery),
  );
}

module.exports = { handleMealPlanForDay };
