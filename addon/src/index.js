/**
 * HA Alexa Intents – Main entry point.
 *
 * Starts an Express HTTP server that accepts POST /alexa requests from a
 * generic Alexa custom skill and routes them to registered intent handlers.
 */

const express = require('express');
const config = require('./config');
const registry = require('./registry');

// Register all intent handlers
require('./intents/index');

const app = express();
app.use(express.json());

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Alexa request handler ──────────────────────────────────────────────────────
app.post('/alexa', async (req, res) => {
  const body = req.body;
  const requestType = body?.request?.type;

  if (!requestType) {
    return res.status(400).json({ error: 'Missing request type' });
  }

  if (requestType === 'LaunchRequest') {
    return res.json(buildResponse('Willkommen bei Home Assistant Alexa Intents. Wie kann ich helfen?'));
  }

  if (requestType === 'SessionEndedRequest') {
    return res.json({ version: '1.0', response: {} });
  }

  if (requestType === 'IntentRequest') {
    const intentName = body.request.intent?.name;
    const slots = body.request.intent?.slots || {};

    // Built-in stop / cancel intents
    if (intentName === 'AMAZON.StopIntent' || intentName === 'AMAZON.CancelIntent') {
      return res.json(buildResponse('Auf Wiedersehen!'));
    }

    const handler = registry.get(intentName);
    if (!handler) {
      console.warn(`[alexa] No handler registered for intent: ${intentName}`);
      return res.json(buildResponse(`Der Intent "${intentName}" ist nicht registriert.`));
    }

    try {
      const text = await handler(slots, config);
      return res.json(buildResponse(text));
    } catch (err) {
      console.error(`[alexa] Error in intent "${intentName}":`, err.message);
      return res.json(buildResponse('Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.'));
    }
  }

  return res.json(buildResponse('Diese Anfrage kann ich nicht verarbeiten.'));
});

// ── Alexa response builder ─────────────────────────────────────────────────────
function buildResponse(text, shouldEndSession = true) {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text,
      },
      shouldEndSession,
    },
  };
}

// ── Start server ───────────────────────────────────────────────────────────────
const port = config.port || 3000;
app.listen(port, () => {
  console.log(`[server] HA Alexa Intents listening on port ${port}`);
});
