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
const { buildDayMealPlanSpeech, parseAlexaDateSlot } = require('../utils/mealPlan');

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

  const date = parseAlexaDateSlot(dateValue);
  if (!date) {
    return `Ich konnte das Datum nicht verstehen.`;
  }

  const mealPlan = await mealie.getMealPlan(config, date);
  const items = Array.isArray(mealPlan?.items) ? mealPlan.items : [];
  return buildDayMealPlanSpeech(date, items);
}

module.exports = { handleMealPlanned };
