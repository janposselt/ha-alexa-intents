/**
 * CreateRecipe intent handler.
 *
 * Starts the create-recipe dialog which walks the user through
 * providing a recipe name and ingredients before calling the Mealie API.
 */

const dialogManager = require('../dialogs/manager');
const createRecipeDialog = require('../dialogs/createRecipe');

/**
 * @param {Record<string, { value: string }>} slots
 * @param {object} config
 * @returns {Promise<string | { text: string, shouldEndSession: boolean }>}
 */
async function handleCreateRecipe(slots, config) {
  const sessionId = config.__sessionId;
  if (!sessionId) {
    return 'Das Erstellen von Rezepten benötigt eine aktive Alexa-Sitzung. Bitte versuche es erneut.';
  }

  return dialogManager.startDialog(
    sessionId,
    createRecipeDialog.TYPE,
    createRecipeDialog.buildInitialState(),
  );
}

module.exports = { handleCreateRecipe };
