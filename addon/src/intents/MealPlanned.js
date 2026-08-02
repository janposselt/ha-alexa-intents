/**
 * MealPlanned intent handler.
 *
 * Slot: date (AMAZON.DATE) – the date to query the Mealie meal plan for.
 *
 * Responses:
 *  - Recipe entry found  → says the recipe name
 *  - Note entry found    → reads the note text
 *  - Nothing planned     → informs the user
 */

const mealie = require('../services/mealie');
const { formatDateDE } = require('../utils/date');

/**
 * @param {Record<string, { value: string }>} slots
 * @param {object} config
 * @returns {Promise<string>}
 */
async function handleMealPlanned(slots, config) {
  const dateValue = slots.date?.value;

  if (!dateValue) {
    return 'Für welches Datum möchtest du den Essensplan wissen?';
  }

  // Alexa may send "PRESENT_REF" for "today"
  let date;
  if (dateValue === 'PRESENT_REF') {
    date = new Date();
  } else {
    date = new Date(dateValue);
  }

  if (isNaN(date.getTime())) {
    return `Ich konnte das Datum nicht verstehen.`;
  }

  date.setHours(0, 0, 0, 0);
  const dateLabel = formatDateDE(date);

  const mealPlan = await mealie.getMealPlan(config, date);
  const items = mealPlan.items || [];

  if (items.length === 0) {
    return `Für ${dateLabel} ist nichts im Essensplan eingetragen.`;
  }

  // Prefer recipe entries over note-only entries
  const recipeEntry = items.find((i) => i.recipe);
  if (recipeEntry) {
    return `Am ${dateLabel} gibt es ${recipeEntry.recipe.name}.`;
  }

  const noteEntry = items.find((i) => i.title);
  if (noteEntry) {
    return `Am ${dateLabel}: ${noteEntry.title}`;
  }

  return `Für ${dateLabel} ist etwas eingetragen, aber ich kann es nicht lesen.`;
}

module.exports = { handleMealPlanned };
