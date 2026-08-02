/**
 * Intent Registry.
 *
 * Maps Alexa intent names to handler functions.
 *
 * Handler signature:
 *   async (slots: Record<string, { value: string }>, config: object) => string | { text: string, shouldEndSession?: boolean }
 *
 * To add a new intent:
 *   1. Create a handler file in ./intents/
 *   2. Register it with registry.register('IntentName', handler) in ./intents/index.js
 */

const handlers = new Map();

/**
 * Register an intent handler.
 * @param {string} intentName - Alexa intent name
 * @param {Function} handler  - async (slots, config) => string | { text, shouldEndSession? }
 */
function register(intentName, handler) {
  handlers.set(intentName, handler);
}

/**
 * Retrieve a handler by intent name, or null if not registered.
 * @param {string} intentName
 * @returns {Function|null}
 */
function get(intentName) {
  return handlers.get(intentName) || null;
}

module.exports = { register, get, list: () => Array.from(handlers.keys()) };
