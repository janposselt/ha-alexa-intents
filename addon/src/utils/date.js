/**
 * Date utilities for intent handlers.
 */

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/**
 * Parses a local date string in YYYY-MM-DD format.
 * @param {string} dateString
 * @returns {Date|null}
 */
function parseLocalDateString(dateString) {
  if (typeof dateString !== 'string') {
    return null;
  }

  const trimmed = dateString.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const [yearString, monthString, dayString] = trimmed.split('-');
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Returns the target Date for a day identifier.
 *
 * @param {'today'|'tomorrow'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday'|string} dayIdentifier
 * @returns {Date}
 */
function getTargetDate(dayIdentifier) {
  const localDate = parseLocalDateString(dayIdentifier);
  if (localDate) {
    return localDate;
  }

  const id = dayIdentifier.trim().toLowerCase();

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
 * Returns true when two dates refer to the same local calendar day.
 * @param {Date} a
 * @param {Date} b
 * @returns {boolean}
 */
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

/**
 * Returns whole-day distance from reference date to target date.
 * @param {Date} reference
 * @param {Date} target
 * @returns {number}
 */
function diffInDays(reference, target) {
  const ref = new Date(reference);
  const trg = new Date(target);
  ref.setHours(0, 0, 0, 0);
  trg.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((trg.getTime() - ref.getTime()) / msPerDay);
}

/**
 * Returns the NEXT occurrence of a weekday index from a reference date.
 * If reference already has that weekday, returns the weekday in the following week.
 *
 * @param {number} weekdayIndex
 * @param {Date} [referenceDate]
 * @returns {Date}
 */
function getNextWeekdayFromDate(weekdayIndex, referenceDate = startOfToday()) {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  let daysUntil = weekdayIndex - today.getDay();
  if (daysUntil <= 0) {
    daysUntil += 7;
  }
  const result = new Date(today);
  result.setDate(today.getDate() + daysUntil);
  return result;
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

/**
 * Formats a date label for speech:
 * - today/tomorrow for immediate days
 * - only weekday if it is the next occurrence of that weekday name
 * - otherwise "Montag, 03.08"
 *
 * @param {Date} date
 * @param {Date} [referenceDate]
 * @returns {string}
 */
function formatDateForSpeech(date, referenceDate = startOfToday()) {
  const dayDiff = diffInDays(referenceDate, date);
  if (dayDiff === 0) {
    return 'heute';
  }
  if (dayDiff === 1) {
    return 'morgen';
  }

  const weekdayIndex = date.getDay();
  const weekdayName = WEEKDAY_DE[weekdayIndex];
  const nextSameWeekday = getNextWeekdayFromDate(weekdayIndex, referenceDate);
  if (isSameDay(date, nextSameWeekday)) {
    return weekdayName;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${weekdayName}, ${day}.${month}`;
}

module.exports = {
  parseLocalDateString,
  getTargetDate,
  getNextWeekday,
  getNextWeekdayFromDate,
  startOfToday,
  isSameDay,
  diffInDays,
  formatDateISO,
  formatDateDE,
  formatDateForSpeech,
};
