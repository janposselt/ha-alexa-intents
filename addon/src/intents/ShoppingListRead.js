/**
 * ShoppingListRead intent handler.
 *
 * Intent: "lese mir die Einkaufsliste ab {date} vor"
 *
 * Starts the shopping-list-reader dialog which reads meal plan entries
 * and their ingredients for 7 days starting from the given date.
 */

const mealie = require('../services/mealie');
const dialogManager = require('../dialogs/manager');
const shoppingListReader = require('../dialogs/shoppingListReader');
const { parseAlexaDateSlot } = require('../utils/mealPlan');

/**
 * @param {Record<string, { value: string }>} slots
 * @param {object} config
 * @returns {Promise<string | { text: string, shouldEndSession: boolean }>}
 */
async function handleShoppingListRead(slots, config) {
  const sessionId = config.__sessionId;
  if (!sessionId) {
    return 'Das Vorlesen der Einkaufsliste benötigt eine aktive Alexa-Sitzung. Bitte versuche es erneut.';
  }

  const dateValue = slots.date?.value;
  const startDate = parseAlexaDateSlot(dateValue);

  if (!startDate) {
    return 'Ab welchem Datum soll ich die Einkaufsliste vorlesen?';
  }

  // Pre-load first day to build the opening text
  let firstDayItems = [];
  try {
    const mealPlan = await mealie.getMealPlan(config, startDate);
    firstDayItems = Array.isArray(mealPlan?.items) ? mealPlan.items : [];
  } catch (err) {
    console.error('[ShoppingListRead] Error loading first day:', err.message);
  }

  // Build opening text for the first day / item
  const WEEKDAY_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const weekday = WEEKDAY_DE[startDate.getDay()];

  let firstItemIngredients = [];
  let firstItemText;

  if (firstDayItems.length === 0) {
    firstItemText = `Einkaufsliste ab ${weekday}. Am ${weekday} ist nichts eingetragen.`;
  } else {
    const fakeInitialState = {
      dates: [],
      dateIndex: 0,
      items: firstDayItems,
      itemIndex: -1,
      ingredients: [],
      ingredientIndex: -1,
      currentText: '',
    };
    const firstResult = await shoppingListReader.loadItem(fakeInitialState, config, 0);
    firstItemText = firstResult.state.currentText;
    firstItemIngredients = firstResult.state.ingredients || [];
  }

  const initialState = shoppingListReader.buildInitialState(
    startDate,
    firstDayItems,
    firstItemText,
    firstItemIngredients,
  );

  return dialogManager.startDialog(
    sessionId,
    shoppingListReader.TYPE,
    initialState,
  );
}

module.exports = { handleShoppingListRead };
