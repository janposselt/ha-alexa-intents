const config = require('./config');
const express = require('express');
const { ExpressAdapter } = require('ask-sdk-express-adapter');
const Alexa = require('ask-sdk-core');
const { google } = require('googleapis');


// ====================================================================
// 1. Google Tasks API Hilfsfunktionen
// ====================================================================

function getOAuth2Client(accessToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

function formatToRFC3339(dateString) {
  return new Date(`${dateString}T00:00:00.000Z`).toISOString();
}

async function getTasks(accessToken) {
  const auth = getOAuth2Client(accessToken);
  const tasks = google.tasks({ version: 'v1', auth });

  const response = await tasks.tasks.list({
    tasklist: '@default',
    showCompleted: false,
  });

  return response.data.items || [];
}

// ====================================================================
// 2. Alexa Handlers (Launch, Intents & Session-Logik)
// ====================================================================

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Willkommen beim Essens-Orakel! Was möchtest du wissen?')
      .reprompt('Wonach möchtest du fragen?')
      .getResponse();
  }
};

const GetMealForDateIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetMealForDateIntent';
  },
  async handle(handlerInput) {
    //const accessToken = Alexa.getAccessToken(handlerInput.requestEnvelope);
    const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
    if (!accessToken) return handleMissingToken(handlerInput);
printAllTaskLists(accessToken); // Debug: Alle Tasklisten ausgeben
    const dateSlot = Alexa.getSlotValue(handlerInput.requestEnvelope, 'date');
    const targetDateStr = dateSlot || new Date().toISOString().split('T')[0];

    try {
      const allTasks = await getTasks(accessToken);
      const targetDateISO = formatToRFC3339(targetDateStr);
      const meals = allTasks.filter(task => task.due === targetDateISO);

      let speakOutput = '';
      if (meals.length === 0) {
        speakOutput = `Für den ${targetDateStr} ist noch kein Essen eingetragen.`;
      } else {
        const titles = meals.map(m => m.title.replace(/^\[Essen\]\s*/i, '')).join(', ');
        speakOutput = `Am ${targetDateStr} gibt es: ${titles}.`;
      }

      return buildResponse(handlerInput, speakOutput);
    } catch (error) {
      console.error(error);
      return handlerInput.responseBuilder
        .speak('Fehler beim Abrufen der Gerichte.')
        .getResponse();
    }
  }
};

const ReadMealPlanFromDateIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ReadMealPlanFromDateIntent';
  },
  async handle(handlerInput) {
    const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
    if (!accessToken) return handleMissingToken(handlerInput);

    const dateSlot = Alexa.getSlotValue(handlerInput.requestEnvelope, 'date');
    const startDateStr = dateSlot || new Date().toISOString().split('T')[0];

    try {
      const allTasks = await getTasks(accessToken);
      const startDate = new Date(`${startDateStr}T00:00:00.000Z`);

      const upcomingMeals = allTasks.filter(task => {
        if (!task.due) return false;
        return new Date(task.due) >= startDate;
      });

      let speakOutput = '';
      if (upcomingMeals.length === 0) {
        speakOutput = `Ab dem ${startDateStr} stehen keine Gerichte im Plan.`;
      } else {
        upcomingMeals.sort((a, b) => new Date(a.due) - new Date(b.due));
        const mealListText = upcomingMeals.map(task => {
          const dateFormatted = task.due.split('T')[0];
          const titleClean = task.title.replace(/^\[Essen\]\s*/i, '');
          return `am ${dateFormatted}: ${titleClean}`;
        }).join('; ');

        speakOutput = `Hier ist der Essensplan ab dem ${startDateStr}: ${mealListText}.`;
      }

      return buildResponse(handlerInput, speakOutput);
    } catch (error) {
      console.error(error);
      return handlerInput.responseBuilder
        .speak('Fehler beim Abrufen des Essensplans.')
        .getResponse();
    }
  }
};

// --- Standard Handlers ---

const HelpIntentHandler = {
  canHandle(h) { return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent'; },
  handle(h) { return h.responseBuilder.speak('Du kannst fragen, was es heute zu essen gibt.').reprompt('Frag mich was.').getResponse(); }
};

const CancelAndStopIntentHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.CancelIntent' || Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(h) { return h.responseBuilder.speak('Guten Appetit!').getResponse(); }
};

const SessionEndedRequestHandler = {
  canHandle(h) { return Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest'; },
  handle(h) { return h.responseBuilder.getResponse(); }
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(h, error) {
    console.error(`Error: ${error.stack}`);
    return h.responseBuilder.speak('Ein Fehler ist aufgetreten.').getResponse();
  }
};

// --- Helper Functions ---

function buildResponse(handlerInput, speakOutput) {
  const isNewSession = Alexa.isNewSession(handlerInput.requestEnvelope);
  if (isNewSession) {
    return handlerInput.responseBuilder.speak(speakOutput).getResponse();
  } else {
    return handlerInput.responseBuilder
      .speak(`${speakOutput} Möchtest du noch etwas wissen?`)
      .reprompt('Möchtest du noch ein Datum abfragen?')
      .getResponse();
  }
}

function handleMissingToken(handlerInput) {
  return handlerInput.responseBuilder
    .speak('Bitte verknüpfe zuerst dein Google-Konto in der Alexa App.')
    .withLinkAccountCard()
    .getResponse();
}

async function printAllTaskLists(accessToken) {
  const auth = getOAuth2Client(accessToken);
  const tasks = google.tasks({ version: 'v1', auth });

  const response = await tasks.tasklists.list();
  const taskLists = response.data.items || [];

  console.log('--- Deine Google Tasks Listen ---');
  taskLists.forEach(list => {
    console.log(`Titel: "${list.title}"  ==>  ID: "${list.id}"`);
  });
}

// ====================================================================
// 3. Express App & ASK Adapter Setup
// ====================================================================

const skillBuilder = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    GetMealForDateIntentHandler,
    ReadMealPlanFromDateIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler);

const skill = skillBuilder.create();
const adapter = new ExpressAdapter(skill, true, true); // (skill, verifySignature, verifyTimestamp)

const app = express();

// POST-Endpunkt für Alexa
app.post('/alexa', adapter.getRequestHandlers());

const PORT = config.port || 3030;
app.listen(PORT, () => {
  console.log(`Alexa Server läuft auf Port ${PORT} unter /alexa`);
});