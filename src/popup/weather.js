/**
 * Weather data module for the popup.
 *
 * Fetches current weather from WeatherAPI.com and exposes a cached,
 * rate-limited interface for the popup to consume.
 *
 * The API key is bundled with the extension (treated as non-secret per
 * story requirements). No user configuration is needed.
 *
 * Exposes functions on `self.Weather` for browser use and via
 * `module.exports` for Node-based test runners.
 */

/* --- Constants --- */

var WEATHER_API_URL = 'https://api.weatherapi.com/v1/current.json';

/** Bundled WeatherAPI.com key — treated as non-secret per story. */
var WEATHER_API_KEY = '8b44741d1fd1405abd6103821262703';

/* --- Timezone → location mapping --- */

/**
 * Static mapping from IANA timezone identifiers to geographic coordinates.
 * Covers every timezone in TIMEZONE_OPTIONS (popup.js).
 * For the "system" sentinel and unknown timezones, see getDefaultLocation().
 */
var WEATHER_LOCATIONS = {
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

/* --- Locale-derived default location --- */

/**
 * Curated mapping from ISO 3166-1 alpha-2 country codes to default
 * weather locations. Used when the clock is set to "system" timezone.
 */
var LOCALE_LOCATIONS = {
  GB: { lat: 51.5074, lon: -0.1278, city: 'London' },
  LK: { lat: 6.9271, lon: 79.8612, city: 'Colombo' },
  US: { lat: 40.7128, lon: -74.006, city: 'New York' },
  AU: { lat: -33.8688, lon: 151.2093, city: 'Sydney' },
  DE: { lat: 52.52, lon: 13.405, city: 'Berlin' },
  JP: { lat: 35.6762, lon: 139.6503, city: 'Tokyo' },
  AE: { lat: 25.2048, lon: 55.2708, city: 'Dubai' },
  FR: { lat: 48.8566, lon: 2.3522, city: 'Paris' },
  IN: { lat: 19.076, lon: 72.8777, city: 'Mumbai' },
  CA: { lat: 43.6532, lon: -79.3832, city: 'Toronto' },
};

/** Global fallback when locale region is unknown or undetectable. */
var DEFAULT_LOCATION = LOCALE_LOCATIONS.US;

/**
 * Extract the region (country code) from the user's locale.
 *
 * Tries Intl.DateTimeFormat().resolvedOptions().locale first, then
 * navigator.language. Parses the region subtag (e.g. "en-GB" → "GB").
 *
 * @returns {string|null} ISO 3166-1 alpha-2 code, or null if undetectable
 */
function getLocaleRegion() {
  var locale = '';

  /* Prefer Intl — most reliable, resolves OS-level locale */
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      var resolved = Intl.DateTimeFormat().resolvedOptions();
      if (resolved && resolved.locale) {
        locale = resolved.locale;
      }
    }
  } catch (_e) {
    /* Intl unavailable — fall through */
  }

  /* Fallback to navigator.language */
  if (!locale && typeof navigator !== 'undefined' && navigator.language) {
    locale = navigator.language;
  }

  if (!locale) {
    return null;
  }

  /* Parse region subtag: "en-GB" → "GB", "si-LK" → "LK", "en-US-x-custom" → "US" */
  var parts = locale.split('-');
  for (var i = 1; i < parts.length; i++) {
    var part = parts[i].toUpperCase();
    if (part.length === 2 && part >= 'AA' && part <= 'ZZ') {
      return part;
    }
  }

  return null;
}

/**
 * Get the default weather location based on the user's locale region.
 * Falls back to New York (US) when the region is unknown or not in
 * the curated map.
 *
 * @returns {{lat: number, lon: number, city: string}}
 */
function getDefaultLocation() {
  var region = getLocaleRegion();
  if (region && LOCALE_LOCATIONS[region]) {
    return LOCALE_LOCATIONS[region];
  }
  return DEFAULT_LOCATION;
}

/**
 * Resolve a timezone identifier to a weather location.
 *
 * For specific IANA timezones (e.g. "Europe/London"), returns the
 * matching entry from WEATHER_LOCATIONS. For the "system" sentinel
 * or unknown timezones, derives a default from the user's locale.
 *
 * @param {string} timeZone - IANA timezone or "system"
 * @returns {{lat: number, lon: number, city: string}}
 */
function getWeatherLocation(timeZone) {
  if (timeZone && timeZone !== 'system' && WEATHER_LOCATIONS[timeZone]) {
    return WEATHER_LOCATIONS[timeZone];
  }
  return getDefaultLocation();
}

/* --- Temperature unit detection --- */

/**
 * Locales that conventionally use Fahrenheit.
 * @type {string[]}
 */
var FAHRENHEIT_LOCALES = ['en-US', 'en-LR', 'en-MM'];

/**
 * Determine whether the user's locale prefers Fahrenheit.
 * Checks navigator.language (browser) against the short list of
 * Fahrenheit-primary locales. Defaults to Celsius.
 *
 * @returns {boolean} true if Fahrenheit should be used
 */
function usesFahrenheit() {
  if (typeof navigator === 'undefined' || !navigator.language) {
    return false;
  }
  var lang = navigator.language;
  for (var i = 0; i < FAHRENHEIT_LOCALES.length; i++) {
    if (lang === FAHRENHEIT_LOCALES[i] || lang.indexOf(FAHRENHEIT_LOCALES[i] + '-') === 0) {
      return true;
    }
  }
  return false;
}

/* --- Response parsing --- */

/**
 * Normalize a weather icon URL to use the https: protocol.
 * WeatherAPI.com returns protocol-relative URLs (e.g. "//cdn.weatherapi.com/...").
 *
 * @param {string} url - Raw icon URL from the API
 * @returns {string} URL with https: prefix
 */
function normalizeIconUrl(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return '';
  }
  if (url.indexOf('//') === 0) {
    return 'https:' + url;
  }
  return url;
}

/**
 * Defensively parse a WeatherAPI.com current.json response into a WeatherDTO.
 *
 * Expected API shape:
 *   {
 *     location: { name, region, country },
 *     current: {
 *       temp_c: number,
 *       temp_f: number,
 *       condition: { text: string, icon: string }
 *     }
 *   }
 *
 * @param {object} data - Raw parsed JSON from the API
 * @returns {{city: string, condition: string, icon: string, temp: number, tempUnit: string}|null}
 *   Returns null if the response lacks minimum usable data.
 */
function parseWeatherResponse(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  /* Location label */
  var city = '';
  if (data.location && typeof data.location === 'object') {
    city = typeof data.location.name === 'string' ? data.location.name : '';
  }

  /* Condition text and icon */
  var condition = '';
  var icon = '';
  if (
    data.current &&
    typeof data.current === 'object' &&
    data.current.condition &&
    typeof data.current.condition === 'object'
  ) {
    var cond = data.current.condition;
    condition = typeof cond.text === 'string' ? cond.text : '';
    icon = normalizeIconUrl(cond.icon || '');
  }

  /* Temperature — pick unit based on locale */
  var temp = null;
  var tempUnit = '';
  if (data.current && typeof data.current === 'object') {
    var fahrenheit = usesFahrenheit();
    if (fahrenheit && typeof data.current.temp_f === 'number') {
      temp = data.current.temp_f;
      tempUnit = '°F';
    } else if (typeof data.current.temp_c === 'number') {
      temp = data.current.temp_c;
      tempUnit = '°C';
    } else if (typeof data.current.temp_f === 'number') {
      /* Fallback: use whichever is available */
      temp = data.current.temp_f;
      tempUnit = '°F';
    }
  }

  /* Require at least a temperature to be considered usable */
  if (temp === null) {
    return null;
  }

  return {
    city: city,
    condition: condition,
    icon: icon,
    temp: temp,
    tempUnit: tempUnit,
  };
}

/* --- API fetch --- */

/**
 * Fetch current weather for a given latitude and longitude.
 *
 * Uses WeatherAPI.com current.json with the bundled API key.
 * Returns a parsed WeatherDTO on success, or null on any failure.
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<{city: string, condition: string, icon: string, temp: number, tempUnit: string}|null>}
 */
function fetchWeather(lat, lon) {
  var url =
    WEATHER_API_URL +
    '?key=' +
    encodeURIComponent(WEATHER_API_KEY) +
    '&q=' +
    encodeURIComponent(lat + ',' + lon);

  return fetch(url, { method: 'GET' })
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

/* --- Condition category mapping --- */

/**
 * Map a WeatherAPI.com condition text to a broad animation category.
 *
 * Categories: "clear", "clouds", "rain", "thunder", "snow", "mist".
 * Uses keyword matching on the lowercased condition string.
 * Falls back to "clear" for unrecognised conditions.
 *
 * @param {string} conditionText - The condition.text from WeatherAPI.com
 * @returns {string} One of the six category identifiers
 */
function getConditionCategory(conditionText) {
  if (typeof conditionText !== 'string' || conditionText.length === 0) {
    return 'clear';
  }
  var text = conditionText.toLowerCase();

  if (text.indexOf('thunder') !== -1) {
    return 'thunder';
  }
  if (
    text.indexOf('snow') !== -1 ||
    text.indexOf('blizzard') !== -1 ||
    text.indexOf('sleet') !== -1 ||
    text.indexOf('ice pellet') !== -1
  ) {
    return 'snow';
  }
  if (
    text.indexOf('rain') !== -1 ||
    text.indexOf('drizzle') !== -1 ||
    text.indexOf('shower') !== -1
  ) {
    return 'rain';
  }
  if (text.indexOf('mist') !== -1 || text.indexOf('fog') !== -1 || text.indexOf('haze') !== -1) {
    return 'mist';
  }
  if (
    text.indexOf('cloud') !== -1 ||
    text.indexOf('overcast') !== -1 ||
    text.indexOf('partly') !== -1
  ) {
    return 'clouds';
  }
  return 'clear';
}

/* --- Exports --- */

var _weatherExports = {
  WEATHER_API_URL: WEATHER_API_URL,
  WEATHER_API_KEY: WEATHER_API_KEY,
  WEATHER_LOCATIONS: WEATHER_LOCATIONS,
  LOCALE_LOCATIONS: LOCALE_LOCATIONS,
  DEFAULT_LOCATION: DEFAULT_LOCATION,
  AUTO_REFRESH_INTERVAL_MS: AUTO_REFRESH_INTERVAL_MS,
  MANUAL_REFRESH_DEBOUNCE_MS: MANUAL_REFRESH_DEBOUNCE_MS,
  getLocaleRegion: getLocaleRegion,
  getDefaultLocation: getDefaultLocation,
  getWeatherLocation: getWeatherLocation,
  usesFahrenheit: usesFahrenheit,
  normalizeIconUrl: normalizeIconUrl,
  parseWeatherResponse: parseWeatherResponse,
  fetchWeather: fetchWeather,
  getWeather: getWeather,
  clearWeatherCache: clearWeatherCache,
  getConditionCategory: getConditionCategory,
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
