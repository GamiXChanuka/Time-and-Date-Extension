/**
 * Weather data module for the popup.
 *
 * Provides location mapping, API fetch, and defensive response parsing.
 * Exposes functions on `self.Weather` for browser use and via
 * `module.exports` for Node-based test runners.
 */

/* --- Constants --- */

var WEATHER_API_URL = 'https://weather-api167.p.rapidapi.com/api/weather/current';
var WEATHER_API_HOST = 'weather-api167.p.rapidapi.com';
var WEATHER_API_KEY = '4e4d7e5b40msh34837e23b23ad5cp18a005jsn3c0f4e72775e';

/* --- Timezone → location mapping --- */

/**
 * Static mapping from IANA timezone identifiers to geographic coordinates.
 * Covers every timezone in TIMEZONE_OPTIONS (popup.js).
 * The "system" sentinel maps to Colombo per story requirements.
 */
var WEATHER_LOCATIONS = {
  system: { lat: 6.9271, lon: 79.8612, city: 'Colombo' },
  UTC: { lat: 51.5074, lon: -0.1278, city: 'London' },
  'America/New_York': { lat: 40.7128, lon: -74.006, city: 'New York' },
  'America/Chicago': { lat: 41.8781, lon: -87.6298, city: 'Chicago' },
  'America/Denver': { lat: 39.7392, lon: -104.9903, city: 'Denver' },
  'America/Los_Angeles': { lat: 34.0522, lon: -118.2437, city: 'Los Angeles' },
  'Europe/London': { lat: 51.5074, lon: -0.1278, city: 'London' },
  'Europe/Berlin': { lat: 52.52, lon: 13.405, city: 'Berlin' },
  'Asia/Dubai': { lat: 25.2048, lon: 55.2708, city: 'Dubai' },
  'Asia/Colombo': { lat: 6.9271, lon: 79.8612, city: 'Colombo' },
  'Asia/Tokyo': { lat: 35.6762, lon: 139.6503, city: 'Tokyo' },
  'Australia/Sydney': { lat: -33.8688, lon: 151.2093, city: 'Sydney' },
};

/**
 * Resolve a timezone identifier to a weather location.
 * Returns {lat, lon, city} from the static mapping.
 * Falls back to Colombo for unknown timezones.
 *
 * @param {string} timeZone - IANA timezone or "system"
 * @returns {{lat: number, lon: number, city: string}}
 */
function getWeatherLocation(timeZone) {
  return WEATHER_LOCATIONS[timeZone] || WEATHER_LOCATIONS.system;
}

/* --- Response parsing --- */

/**
 * Defensively parse a weather API response into a WeatherDTO.
 *
 * Expected API shape:
 *   { name, weather: [{description, icon}], main: {temprature} }
 *
 * Note: the API misspells "temperature" as "temprature".
 * We try both spellings for forward-compatibility.
 *
 * @param {object} data - Raw parsed JSON from the API
 * @returns {{city: string, condition: string, icon: string, temp: number|null}|null}
 *   Returns null if the response lacks minimum usable data.
 */
function parseWeatherResponse(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  var city = typeof data.name === 'string' ? data.name : '';

  var condition = '';
  var icon = '';
  if (Array.isArray(data.weather) && data.weather.length > 0) {
    var w = data.weather[0];
    if (w && typeof w === 'object') {
      condition = typeof w.description === 'string' ? w.description : '';
      icon = typeof w.icon === 'string' ? w.icon : '';
    }
  }

  var temp = null;
  if (data.main && typeof data.main === 'object') {
    // Handle the documented "temprature" misspelling first, then standard spelling
    if (typeof data.main.temprature === 'number') {
      temp = data.main.temprature;
    } else if (typeof data.main.temperature === 'number') {
      temp = data.main.temperature;
    } else if (typeof data.main.temp === 'number') {
      temp = data.main.temp;
    }
  }

  // Require at least a temperature to be considered usable
  if (temp === null) {
    return null;
  }

  return {
    city: city,
    condition: condition,
    icon: icon,
    temp: temp,
  };
}

/* --- API fetch --- */

/**
 * Fetch current weather for a given latitude and longitude.
 *
 * Uses the RapidAPI current weather endpoint with metric units.
 * Returns a parsed WeatherDTO on success, or null on any failure.
 * Errors are logged to the console with redacted messages (no API key).
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<{city: string, condition: string, icon: string, temp: number}|null>}
 */
function fetchWeather(lat, lon) {
  var url =
    WEATHER_API_URL +
    '?lat=' +
    encodeURIComponent(lat) +
    '&lon=' +
    encodeURIComponent(lon) +
    '&units=metric&lang=en&mode=json';

  return fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': WEATHER_API_HOST,
      'x-rapidapi-key': WEATHER_API_KEY,
    },
  })
    .then(function (response) {
      if (!response.ok) {
        console.error('Weather: API returned status ' + response.status);
        return null;
      }
      return response.json();
    })
    .then(function (data) {
      if (data === null) {
        return null;
      }
      var dto = parseWeatherResponse(data);
      if (!dto) {
        console.error('Weather: unexpected response structure');
      }
      return dto;
    })
    .catch(function (err) {
      console.error('Weather: fetch failed —', err && err.message ? err.message : 'unknown error');
      return null;
    });
}

/* --- In-session caching and rate limiting --- */

/** Automatic refresh interval: 10 minutes. */
var AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/** Manual refresh debounce: 15 seconds. */
var MANUAL_REFRESH_DEBOUNCE_MS = 15 * 1000;

/**
 * In-memory cache keyed by "lat,lon".
 * Each entry: { data: WeatherDTO, fetchedAt: number }
 * Lives only for the popup session — no persistence.
 * @type {Object<string, {data: object, fetchedAt: number}>}
 */
var _weatherCache = {};

/**
 * Build a cache key from coordinates.
 * @param {number} lat
 * @param {number} lon
 * @returns {string}
 */
function _cacheKey(lat, lon) {
  return lat + ',' + lon;
}

/**
 * Get weather for a location with caching and rate limiting.
 *
 * Automatic calls (forceRefresh=false) reuse cached data younger than
 * 10 minutes. Manual refresh calls (forceRefresh=true) are debounced
 * to at most once per 15 seconds per location.
 *
 * On fetch failure, returns stale cached data if available, or null.
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {boolean} [forceRefresh] - True for manual refresh (15s debounce)
 * @returns {Promise<{data: object, fetchedAt: number}|null>}
 */
function getWeather(lat, lon, forceRefresh) {
  var key = _cacheKey(lat, lon);
  var cached = _weatherCache[key];
  var now = Date.now();

  if (cached) {
    var age = now - cached.fetchedAt;
    var threshold = forceRefresh ? MANUAL_REFRESH_DEBOUNCE_MS : AUTO_REFRESH_INTERVAL_MS;
    if (age < threshold) {
      return Promise.resolve(cached);
    }
  }

  return fetchWeather(lat, lon).then(function (dto) {
    if (dto) {
      _weatherCache[key] = { data: dto, fetchedAt: Date.now() };
      return _weatherCache[key];
    }
    // On failure, return stale cache if available
    return cached || null;
  });
}

/**
 * Clear the in-memory weather cache.
 * Exposed for testing.
 */
function clearWeatherCache() {
  _weatherCache = {};
}

/* --- Exports --- */

var _weatherExports = {
  WEATHER_API_URL: WEATHER_API_URL,
  WEATHER_API_HOST: WEATHER_API_HOST,
  WEATHER_LOCATIONS: WEATHER_LOCATIONS,
  AUTO_REFRESH_INTERVAL_MS: AUTO_REFRESH_INTERVAL_MS,
  MANUAL_REFRESH_DEBOUNCE_MS: MANUAL_REFRESH_DEBOUNCE_MS,
  getWeatherLocation: getWeatherLocation,
  parseWeatherResponse: parseWeatherResponse,
  fetchWeather: fetchWeather,
  getWeather: getWeather,
  clearWeatherCache: clearWeatherCache,
};

// Browser: expose on self for popup.js to consume
if (typeof self !== 'undefined') {
  self.Weather = _weatherExports;
}

// Node: expose via module.exports for tests
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && module.exports) {
  // eslint-disable-next-line no-undef
  module.exports = _weatherExports;
}
