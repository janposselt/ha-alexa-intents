/**
 * Mealie API client.
 *
 * All functions accept the Add-On config object and return parsed response data.
 * Throws on HTTP errors so callers can handle them.
 */

const axios = require('axios');
const { formatDateISO } = require('../utils/date');
const MEALPLAN_ENDPOINTS = ['/api/groups/mealplans', '/api/households/mealplans'];
const RECIPE_ENDPOINTS = ['/api/recipes', '/api/households/recipes'];

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
 * Performs a request against fallback endpoint candidates for supported HTTP status codes.
 *
 * @param {import('axios').AxiosInstance} client
 * @param {'get'|'post'} method
 * @param {string[]} endpoints
 * @param {object} options
 * @param {number[]} [fallbackStatuses]
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function requestWithEndpointFallback(client, method, endpoints, options, fallbackStatuses = [404, 405]) {
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const response = await client.request({
        method,
        url: endpoint,
        ...options,
      });
      return response;
    } catch (err) {
      err.mealieEndpoint = endpoint;
      if (fallbackStatuses.includes(err.response?.status)) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  if (lastError) {
    lastError.mealieEndpointCandidates = endpoints;
    throw lastError;
  }
}

/**
 * Performs a request against fallback endpoint candidates with an item ID suffix.
 *
 * @param {import('axios').AxiosInstance} client
 * @param {'delete'} method
 * @param {string[]} endpoints
 * @param {string} itemId
 * @param {object} options
 * @param {number[]} [fallbackStatuses]
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function requestWithEndpointIdFallback(
  client,
  method,
  endpoints,
  itemId,
  options = {},
  fallbackStatuses = [404, 405],
) {
  const withId = endpoints.map((endpoint) => `${endpoint}/${itemId}`);
  return requestWithEndpointFallback(client, method, withId, options, fallbackStatuses);
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
  const response = await requestWithEndpointFallback(client, 'get', MEALPLAN_ENDPOINTS, {
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
  const response = await requestWithEndpointFallback(client, 'get', RECIPE_ENDPOINTS, {
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
  const response = await requestWithEndpointFallback(client, 'post', MEALPLAN_ENDPOINTS, { data: body });
  return response.data;
}

/**
 * Deletes a meal plan entry by entry ID.
 *
 * @param {object} config
 * @param {string} entryId
 * @returns {Promise<void>}
 */
async function deleteMealPlanEntry(config, entryId) {
  const client = createClient(config);
  await requestWithEndpointIdFallback(client, 'delete', MEALPLAN_ENDPOINTS, entryId);
}

/**
 * Deletes all meal plan entries for a specific date.
 *
 * @param {object} config
 * @param {Date} date
 * @returns {Promise<{ deletedCount: number, totalCount: number }>}
 */
async function deleteMealPlanForDate(config, date) {
  const mealPlan = await getMealPlan(config, date);
  const items = Array.isArray(mealPlan?.items) ? mealPlan.items : [];
  let deletedCount = 0;

  for (const item of items) {
    if (!item?.id) {
      continue;
    }
    await deleteMealPlanEntry(config, item.id);
    deletedCount += 1;
  }

  return { deletedCount, totalCount: items.length };
}

const PARSER_ENDPOINT = '/api/parser/ingredient';

/**
 * Creates a new recipe by name.
 *
 * @param {object} config
 * @param {string} name - Recipe name
 * @returns {Promise<string>} Slug of the created recipe
 */
async function createRecipe(config, name) {
  const client = createClient(config);
  const response = await requestWithEndpointFallback(client, 'post', RECIPE_ENDPOINTS, {
    data: { name },
  });
  // Mealie returns the slug as a plain string
  return typeof response.data === 'string' ? response.data : response.data?.slug ?? response.data;
}

/**
 * Updates an existing recipe (e.g. to add ingredients).
 *
 * @param {object} config
 * @param {string} slug
 * @param {object} data - Partial recipe object to merge
 * @returns {Promise<object>}
 */
async function updateRecipe(config, slug, data) {
  const client = createClient(config);
  const response = await client.patch(`/api/recipes/${slug}`, data);
  return response.data;
}

/**
 * Parses a single ingredient string using the Mealie NLP parser.
 * Falls back to a raw note object if the API is unavailable.
 *
 * @param {object} config
 * @param {string} ingredientText
 * @returns {Promise<object>} Parsed ingredient object suitable for PUT /api/recipes/{slug}
 */
async function parseIngredient(config, ingredientText) {
  const client = createClient(config);
  try {
    const response = await client.post(PARSER_ENDPOINT, { ingredient: ingredientText });
    const parsed = response.data;
    // Return the ingredient sub-object if it exists, otherwise the whole response
    return parsed?.ingredient ?? parsed;
  } catch {
    return {
      note: ingredientText,
      original_text: ingredientText,
    };
  }
}

module.exports = {
  getMealPlan,
  searchRecipes,
  createMealPlan,
  deleteMealPlanEntry,
  deleteMealPlanForDate,
  createRecipe,
  updateRecipe,
  parseIngredient,
};
