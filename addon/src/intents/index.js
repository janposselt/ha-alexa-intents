/**
 * Intent registration.
 *
 * Add new intents here:
 *   1. Import the handler function.
 *   2. Call registry.register('IntentName', handler).
 *
 * Handler signature: async (slots, config) => string
 */

const registry = require('../registry');
const { handleMealPlanned } = require('./MealPlanned');
const { handleMealPlanForDay } = require('./MealPlanForDay');

// ── MealPlanned ────────────────────────────────────────────────────────────────
// Query what is planned for a given date.
registry.register('MealPlanned', handleMealPlanned);

// ── MealPlanFor[Weekday] ───────────────────────────────────────────────────────
// Set a recipe (or note) for a specific day.
// Each weekday resolves to the NEXT occurrence of that day (see utils/date.js).
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

for (const day of WEEKDAYS) {
  registry.register(
    `MealPlanFor${day}`,
    (slots, config) => handleMealPlanForDay(day.toLowerCase(), slots, config),
  );
}

registry.register('MealPlanForToday', (slots, config) => handleMealPlanForDay('today', slots, config));
registry.register('MealPlanForTomorrow', (slots, config) => handleMealPlanForDay('tomorrow', slots, config));
