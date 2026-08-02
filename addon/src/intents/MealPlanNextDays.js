const mealie = require('../services/mealie');
const { startOfToday } = require('../utils/date');
const { buildDayMealPlanSpeech } = require('../utils/mealPlan');

/**
 * Reads the meal plan for the next X days including today.
 *
 * @param {Record<string, { value: string }>} slots
 * @param {object} config
 * @returns {Promise<string>}
 */
async function handleMealPlanNextDays(slots, config) {
  const rawDays = slots.days?.value;
  const days = Number.parseInt(rawDays, 10);

  if (!Number.isInteger(days) || days < 1) {
    return 'Für wie viele Tage soll ich den Essensplan vorlesen?';
  }

  const boundedDays = Math.min(days, 14);
  const today = startOfToday();
  const lines = [];

  for (let offset = 0; offset < boundedDays; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);

    const mealPlan = await mealie.getMealPlan(config, date);
    const items = Array.isArray(mealPlan?.items) ? mealPlan.items : [];
    lines.push(buildDayMealPlanSpeech(date, items));
  }

  return lines.join(' ');
}

module.exports = { handleMealPlanNextDays };
