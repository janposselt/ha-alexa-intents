# ha-alexa-intents

A **Home Assistant Add-On** that handles arbitrary Alexa custom skill intents via an extensible Node.js registry.

An Alexa custom skill forwards every `IntentRequest` to this service. The service looks up the intent name in a registry, calls the registered handler with the slot values, and returns the spoken response to Alexa.

---

## Features

- Generic intent routing – add new intents without touching the core server
- Mealie meal plan integration (query & set recipes/notes)
- Configurable Mealie host and API token via the HA Add-On UI
- German voice responses

---

## Included Intents

| Intent | Slot | Description |
|---|---|---|
| `MealPlanned` | `date` (AMAZON.DATE) | Asks Mealie what is planned for the given date and reads the recipe name or note |
| `MealPlanForMonday` … `MealPlanForSunday` | `receipt` (AMAZON.SearchQuery) | Searches Mealie for the recipe name and sets it for the next occurrence of that weekday |
| `MealPlanForToday` | `receipt` | Sets a recipe or note for today |
| `MealPlanForTomorrow` | `receipt` | Sets a recipe or note for tomorrow |
| `MealPlanDelete` | `date` (AMAZON.DATE) | Deletes all meal plan entries for the given date |
| `MealPlanNextDays` | `days` (AMAZON.NUMBER) | Reads the meal plan for the next X days (including today) |

**Weekday rule:** `MealPlanForMonday` always refers to the *next* Monday. If today *is* Monday it resolves to next week Monday.

**Dialog rule:** If no recipe is found while setting a meal, Alexa asks whether to create a note, search another recipe, or cancel.

---

## Installation

1. In Home Assistant go to **Settings → Add-ons → Add-on Store → ⋮ → Repositories** and add this repository URL.
2. Install the **HA Alexa Intents** add-on.
3. Configure `mealie_host` and `mealie_token` in the add-on configuration.
4. Start the add-on and note the port (default `3000`).

---

## Alexa Skill Setup

1. Create a new **Custom** Alexa skill in the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask).
2. Under **Build → JSON Editor** paste the contents of [`skill/interaction-model.json`](skill/interaction-model.json).
3. Under **Build → Endpoint** choose *HTTPS*, enter `https://<your-ha-host>:<port>/alexa`, and set the SSL certificate type to match your setup.
4. Save and build the model.

---

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `port` | int | `3000` | HTTP port the service listens on |
| `mealie_host` | string | `http://localhost:9000` | Base URL of the Mealie instance |
| `mealie_token` | string | *(empty)* | Mealie API token |

---

## Adding New Intents

See [`.github/agents/add-intent.md`](.github/agents/add-intent.md) for step-by-step instructions (also used as agent instructions for AI-assisted intent development).

---

## Project Structure

```
addon/
  config.yaml          HA Add-on manifest
  Dockerfile
  run.sh
  src/
    index.js           Express server + Alexa request routing
    config.js          Config loader (/data/options.json or env vars)
    registry.js        Intent registry
    intents/
      index.js         Registers all intent handlers
      MealPlanned.js
      MealPlanForDay.js
    services/
      mealie.js        Mealie API client
    utils/
      date.js          Date helpers (next weekday, formatting)
    package.json
skill/
  interaction-model.json  Sample Alexa skill interaction model (de-DE)
.github/
  agents/
    add-intent.md      Agent instructions for adding intents
```