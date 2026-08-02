# Agent Instructions: Adding a New Alexa Intent

Follow these steps to add a new intent to the HA Alexa Intents Add-On.

---

## 1. Create a Handler File

Create a new file in `addon/src/intents/` named after your intent (e.g. `MyNewIntent.js`).

### Handler Skeleton

```js
/**
 * MyNewIntent handler.
 *
 * Slots:
 *   - slotName (AMAZON.TYPE) – description of what this slot captures.
 *
 * Behavior:
 *   - Describe what this intent does.
 */

// Import services and utilities as needed, e.g.:
// const mealie = require('../services/mealie');
// const { getTargetDate, formatDateDE } = require('../utils/date');

/**
 * @param {Record<string, { value: string }>} slots  – Alexa slot map
 * @param {object} config                            – Add-On configuration
 * @returns {Promise<string>}                        – Text spoken back to the user
 */
async function handleMyNewIntent(slots, config) {
  const mySlot = slots.slotName?.value;

  if (!mySlot) {
    return 'Bitte gib einen Wert für slotName an.';
  }

  // TODO: implement the intent logic here
  return `Du hast ${mySlot} gesagt.`;
}

module.exports = { handleMyNewIntent };
```

**Rules:**
- The handler must be an `async` function returning a `string` (the spoken response in German).
- Handle missing slot values gracefully with a helpful reprompt string.
- Use `try/catch` only if you need custom error messages; the framework catches unhandled errors automatically.
- Import shared utilities from `../utils/date` and API clients from `../services/`.

---

## 2. Register the Intent

Open `addon/src/intents/index.js` and add two lines:

```js
// 1. Import the handler (add near the top with the other imports)
const { handleMyNewIntent } = require('./MyNewIntent');

// 2. Register it (add after the existing registry.register calls)
registry.register('MyNewIntent', handleMyNewIntent);
```

If the intent needs to receive a fixed parameter (like a weekday name), use a closure:

```js
registry.register('MyNewIntent', (slots, config) => handleMyNewIntent('fixedParam', slots, config));
```

---

## 3. Update the Alexa Interaction Model

Open `skill/interaction-model.json` and add an entry inside the `"intents"` array:

```json
{
  "name": "MyNewIntent",
  "slots": [
    {
      "name": "slotName",
      "type": "AMAZON.SearchQuery"
    }
  ],
  "samples": [
    "Mein neuer Intent mit {slotName}",
    "Weiterer Satz mit {slotName}"
  ]
}
```

Common Alexa built-in slot types:
| Type | Use for |
|---|---|
| `AMAZON.DATE` | Dates ("morgen", "Montag", "15. Januar") |
| `AMAZON.TIME` | Times ("um 8 Uhr") |
| `AMAZON.NUMBER` | Numbers |
| `AMAZON.SearchQuery` | Free-text recipe/note names |
| `AMAZON.City` | City names |

Then upload the updated model in the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) under **Build → JSON Editor**.

---

## 4. Checklist Before Finishing

- [ ] Handler file created in `addon/src/intents/MyNewIntent.js`
- [ ] Handler exported as `module.exports = { handleMyNewIntent }`
- [ ] Intent registered in `addon/src/intents/index.js`
- [ ] Interaction model entry added to `skill/interaction-model.json`
- [ ] German response strings used for all spoken text
- [ ] Missing slot values return a helpful reprompt string

---

## Available Services & Utilities

### `addon/src/services/mealie.js`

```js
const mealie = require('../services/mealie');

// Get all meal plan entries for a date
const plan = await mealie.getMealPlan(config, date);
// plan.items → array of { id, date, entryType, title, recipe: { id, name } | null }

// Search recipes by name
const result = await mealie.searchRecipes(config, 'Spaghetti Bolognese');
// result.items → array of { id, name, slug, ... }

// Create a meal plan entry (recipe or note)
await mealie.createMealPlan(config, date, recipeId, null);   // recipe entry
await mealie.createMealPlan(config, date, null, 'My note');  // note entry
```

### `addon/src/utils/date.js`

```js
const { getTargetDate, formatDateISO, formatDateDE } = require('../utils/date');

getTargetDate('today')     // → Date (today at midnight)
getTargetDate('tomorrow')  // → Date (tomorrow at midnight)
getTargetDate('monday')    // → Date (next Monday – if today IS Monday, returns next week)

formatDateISO(date)        // → "2024-01-15"
formatDateDE(date)         // → "Montag, 15. Januar"
```

---

## Example: Adding a "WhatIsInTheFridge" Intent

**`addon/src/intents/WhatIsInTheFridge.js`** *(simplified)*
```js
async function handleWhatIsInTheFridge(slots, config) {
  return 'Diese Funktion ist noch nicht implementiert.';
}
module.exports = { handleWhatIsInTheFridge };
```

**`addon/src/intents/index.js`** – add:
```js
const { handleWhatIsInTheFridge } = require('./WhatIsInTheFridge');
registry.register('WhatIsInTheFridge', handleWhatIsInTheFridge);
```

**`skill/interaction-model.json`** – add intent with no slots:
```json
{
  "name": "WhatIsInTheFridge",
  "slots": [],
  "samples": [
    "Was ist im Kühlschrank",
    "Was habe ich im Kühlschrank"
  ]
}
```
