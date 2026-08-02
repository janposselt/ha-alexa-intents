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
    port: parseInt(process.env.PORT, 10) || 3000,
    mealie_host: process.env.MEALIE_HOST || 'http://localhost:9000',
    mealie_token: process.env.MEALIE_TOKEN || '',
  };
}

module.exports = config;
