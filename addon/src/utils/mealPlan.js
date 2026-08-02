const { formatDateForSpeech, parseLocalDateString } = require('./date');

/**
 * Parses an Alexa date slot value into a local Date (midnight).
 *
 * @param {string|undefined} dateValue
 * @returns {Date|null}
 */
function parseAlexaDateSlot(dateValue) {
  if (!dateValue) {
    return null;
  }

  if (dateValue === 'PRESENT_REF') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  return parseLocalDateString(dateValue);
}

/**
 * Converts meal plan items into readable recipe/note labels.
 *
 * @param {Array} items
 * @returns {string[]}
 */
function mealPlanItemLabels(items) {
  const labels = [];
  for (const item of items) {
    if (item?.recipe?.name) {
      labels.push(item.recipe.name);
      continue;
    }
    if (item?.title) {
      labels.push(`Notiz: ${item.title}`);
    }
  }
  return labels;
}

/**
 * Builds a spoken sentence for a single day meal plan.
 *
 * @param {Date} date
 * @param {Array} items
 * @returns {string}
 */
function buildDayMealPlanSpeech(date, items) {
  const dateLabel = formatDateForSpeech(date);
  const labels = mealPlanItemLabels(items);

  if (labels.length === 0) {
    return `${capitalizeFirst(dateLabel)} ist nichts im Essensplan eingetragen.`;
  }

  return `${capitalizeFirst(dateLabel)} gibt es: ${labels.join(', ')}.`;
}

function capitalizeFirst(text) {
  if (!text) {
    return text;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

module.exports = {
  parseAlexaDateSlot,
  mealPlanItemLabels,
  buildDayMealPlanSpeech,
  capitalizeFirst,
};
