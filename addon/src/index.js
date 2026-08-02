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
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', port, uptime: Math.round(process.uptime()), intents: registry.list() });
});

app.get('/', (_req, res) => {
  const startTime = new Date(Date.now() - Math.round(process.uptime() * 1000));
  const intentList = registry.list().map(n => `<li><code>${n}</code></li>`).join('\n    ');
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HA Alexa Intents</title>
  <style>
    body { font-family: sans-serif; max-width: 680px; margin: 40px auto; padding: 0 20px; color: #333; }
    h1 { color: #1a73e8; }
    .badge { display: inline-block; background: #34a853; color: #fff; padding: 4px 12px; border-radius: 12px; font-weight: bold; }
    table { border-collapse: collapse; width: 100%; margin-top: 1em; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
    th { background: #f5f5f5; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>HA Alexa Intents</h1>
  <p><span class="badge">&#10003; Running</span></p>
  <table>
    <tr><th>Port</th><td><code>${port}</code></td></tr>
    <tr><th>Started</th><td>${startTime.toLocaleString('de-DE')}</td></tr>
    <tr><th>Uptime</th><td>${Math.round(process.uptime())} s</td></tr>
    <tr><th>Alexa Endpoint</th><td><code>POST /alexa</code></td></tr>
    <tr><th>Health (JSON)</th><td><a href="/health"><code>/health</code></a></td></tr>
  </table>
  <h2>Registrierte Intents</h2>
  <ul>
    ${intentList}
  </ul>
</body>
</html>`;
  res.type('html').send(html);
});

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
const port = config.port || 3030;
app.listen(port, () => {
  console.log(`[server] HA Alexa Intents listening on port ${port}`);
});
