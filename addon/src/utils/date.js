/**
 * Date utilities for intent handlers.
 */

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Returns the target Date for a day identifier.
 *
 * @param {'today'|'tomorrow'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday'} dayIdentifier
 * @returns {Date}
 */
function getTargetDate(dayIdentifier) {
  const id = dayIdentifier.toLowerCase();

  if (id === 'today') {
    return startOfToday();
  }

  if (id === 'tomorrow') {
    const d = startOfToday();
    d.setDate(d.getDate() + 1);
    return d;
  }

  return getNextWeekday(id);
}

/**
 * Returns the NEXT occurrence of the given weekday.
 * If today IS that weekday, returns the same weekday next week.
 *
 * @param {string} weekdayName - lowercase weekday name
 * @returns {Date}
 */
function getNextWeekday(weekdayName) {
  const targetIndex = WEEKDAY_NAMES.indexOf(weekdayName);
  if (targetIndex === -1) {
    throw new Error(`Unknown weekday: ${weekdayName}`);
  }

  const today = startOfToday();
  const todayIndex = today.getDay();

  let daysUntil = targetIndex - todayIndex;
  if (daysUntil <= 0) {
    daysUntil += 7;
  }

  const result = new Date(today);
  result.setDate(today.getDate() + daysUntil);
  return result;
}

/**
 * Returns today at midnight (local time).
 * @returns {Date}
 */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Formats a Date to YYYY-MM-DD (local time).
 * @param {Date} date
 * @returns {string}
 */
function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Formats a Date as a German weekday + date string, e.g. "Montag, 5. Januar".
 * @param {Date} date
 * @returns {string}
 */
function formatDateDE(date) {
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

module.exports = { getTargetDate, getNextWeekday, formatDateISO, formatDateDE };
