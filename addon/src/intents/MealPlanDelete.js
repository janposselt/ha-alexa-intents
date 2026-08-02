const mealie = require('../services/mealie');
const { formatDateForSpeech } = require('../utils/date');
const { parseAlexaDateSlot } = require('../utils/mealPlan');

/**
 * Deletes all meal plan entries for the given date.
 *
 * @param {Record<string, { value: string }>} slots
 * @param {object} config
 * @returns {Promise<string>}
 */
async function handleMealPlanDelete(slots, config) {
  const dateValue = slots.date?.value;
  const date = parseAlexaDateSlot(dateValue);

  if (!date) {
    return 'Für welchen Tag soll ich den Essensplan löschen?';
  }

  const { deletedCount, totalCount } = await mealie.deleteMealPlanForDate(config, date);
  const dateLabel = formatDateForSpeech(date);

  if (totalCount === 0) {
    return `Für ${dateLabel} war nichts eingetragen.`;
  }

  if (deletedCount === 0) {
    return `Für ${dateLabel} konnte ich nichts löschen. Bitte prüfe das Add-On-Log.`;
  }

  if (deletedCount === 1) {
    return `Ich habe den Essensplan für ${dateLabel} gelöscht.`;
  }

  return `Ich habe ${deletedCount} Einträge im Essensplan für ${dateLabel} gelöscht.`;
}

module.exports = { handleMealPlanDelete };
