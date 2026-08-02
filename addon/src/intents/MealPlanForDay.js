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
const { getTargetDate, formatDateDE } = require('../utils/date');

/**
 * @param {string} dayIdentifier - 'today' | 'tomorrow' | lowercase weekday name
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
  const dateLabel = formatDateDE(date);

  const searchResult = await mealie.searchRecipes(config, recipeQuery);
  const recipes = searchResult.items || [];

  if (recipes.length > 0) {
    const recipe = recipes[0];
    await mealie.createMealPlan(config, date, recipe.id, null);
    return `Ich habe ${recipe.name} für ${dateLabel} eingetragen.`;
  }

  // No matching recipe found – create a note instead
  await mealie.createMealPlan(config, date, null, recipeQuery);
  return `Ich habe kein Rezept für "${recipeQuery}" gefunden und stattdessen eine Notiz für ${dateLabel} eingetragen.`;
}

module.exports = { handleMealPlanForDay };
