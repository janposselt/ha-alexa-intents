/**
 * Mealie API client.
 *
 * All functions accept the Add-On config object and return parsed response data.
 * Throws on HTTP errors so callers can handle them.
 */

const axios = require('axios');
const { formatDateISO } = require('../utils/date');

/**
 * Creates a pre-configured axios instance for the Mealie API.
 * @param {object} config
 * @returns {import('axios').AxiosInstance}
 */
function createClient(config) {
  return axios.create({
    baseURL: config.mealie_host,
    headers: {
      Authorization: 'Bearer ' + config.mealie_token,
      'Content-Type': 'application/json',
    },
    timeout: 8000,
  });
}

/**
 * Retrieves the meal plan entries for a specific date.
 *
 * @param {object} config
 * @param {Date} date
 * @returns {Promise<{ items: Array }>}
 */
async function getMealPlan(config, date) {
  const client = createClient(config);
  const dateStr = formatDateISO(date);
  const response = await client.get('/api/groups/mealplans', {
    params: {
      start_date: dateStr,
      end_date: dateStr,
      perPage: 50,
    },
  });
  return response.data;
}

/**
 * Searches for recipes by name.
 *
 * @param {object} config
 * @param {string} query
 * @returns {Promise<{ items: Array }>}
 */
async function searchRecipes(config, query) {
  const client = createClient(config);
  const response = await client.get('/api/recipes', {
    params: {
      search: query,
      perPage: 5,
      page: 1,
    },
  });
  return response.data;
}

/**
 * Creates a meal plan entry for the given date.
 *
 * Pass either recipeId (recipe entry) or title (note entry), not both.
 *
 * @param {object} config
 * @param {Date} date
 * @param {string|null} recipeId - UUID of the recipe
 * @param {string|null} title    - Note text when no recipe is found
 * @returns {Promise<object>}
 */
async function createMealPlan(config, date, recipeId, title) {
  const client = createClient(config);
  const body = {
    date: formatDateISO(date),
    entryType: recipeId ? 'dinner' : 'side',
  };
  if (recipeId) {
    body.recipeId = recipeId;
  } else {
    body.title = title;
  }
  const response = await client.post('/api/groups/mealplans', body);
  return response.data;
}

module.exports = { getMealPlan, searchRecipes, createMealPlan };
