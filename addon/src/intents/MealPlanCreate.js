/**
 * MealPlanCreate intent handler.
 *
 * Intent: "erstelle mir einen Essensplan ab {date}"
 *
 * Starts the meal-plan-creator dialog which guides the user through
 * planning 7 days of meals starting from the given date.
 */

const mealie = require('../services/mealie');
const dialogManager = require('../dialogs/manager');
const mealPlanCreator = require('../dialogs/mealPlanCreator');
const { parseAlexaDateSlot } = require('../utils/mealPlan');

/**
 * @param {Record<string, { value: string }>} slots
 * @param {object} config
 * @returns {Promise<string | { text: string, shouldEndSession: boolean }>}
 */
async function handleMealPlanCreate(slots, config) {
  const sessionId = config.__sessionId;
  if (!sessionId) {
    return 'Das Erstellen eines Essensplans benötigt eine aktive Alexa-Sitzung. Bitte versuche es erneut.';
  }

  const dateValue = slots.date?.value;
  const startDate = parseAlexaDateSlot(dateValue);

  if (!startDate) {
    return 'Für welches Datum soll ich den Essensplan starten?';
  }

  // Pre-load existing items for the first day so getPrompt can include them
  let existingItemsForFirstDay = [];
  try {
    const mealPlan = await mealie.getMealPlan(config, startDate);
    existingItemsForFirstDay = Array.isArray(mealPlan?.items) ? mealPlan.items : [];
  } catch (err) {
    console.error('[MealPlanCreate] Error loading first day items:', err.message);
  }

  return dialogManager.startDialog(
    sessionId,
    mealPlanCreator.TYPE,
    mealPlanCreator.buildInitialState(startDate, existingItemsForFirstDay),
  );
}

module.exports = { handleMealPlanCreate };
