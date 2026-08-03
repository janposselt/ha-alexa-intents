/**
 * Config loader.
 *
 * Inside the HA Add-On the configuration is written to /data/options.json.
 * For local development, environment variables are used as a fallback.
 */

let config;

try {
  config = require('/data/options.json');
} catch {
  config = {
    port: parseInt(process.env.PORT, 10) || 3030,
    google_access_token: process.env.GOOGLE_ACCESS_TOKEN || '',
    google_client_id: process.env.GOOGLE_CLIENT_ID || '',
  };
}

module.exports = config;
