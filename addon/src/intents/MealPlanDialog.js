/**
 * Fallback handler for dialog-specific intents when no dialog is active.
 *
 * @returns {string}
 */
function handleMealPlanDialogWithoutActiveSession() {
  return 'Es ist gerade kein offener Dialog aktiv. Bitte starte eine neue Essensplan-Anfrage.';
}

module.exports = { handleMealPlanDialogWithoutActiveSession };
