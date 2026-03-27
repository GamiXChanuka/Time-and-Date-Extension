/* --- Curated time zone list --- */

var TIMEZONE_OPTIONS = [
  { value: 'system', label: 'System default' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'US Eastern (New York)' },
  { value: 'America/Chicago', label: 'US Central (Chicago)' },
  { value: 'America/Denver', label: 'US Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (Los Angeles)' },
  { value: 'Europe/London', label: 'UK (London)' },
  { value: 'Europe/Berlin', label: 'Europe Central (Berlin)' },
  { value: 'Asia/Dubai', label: 'Gulf (Dubai)' },
  { value: 'Asia/Colombo', label: 'Sri Lanka (Colombo)' },
  { value: 'Asia/Tokyo', label: 'Japan (Tokyo)' },
  { value: 'Australia/Sydney', label: 'Australia (Sydney)' },
];

/* --- Settings defaults and persistence --- */

var SETTINGS_STORAGE_KEY = 'dualClockSettings';

var DEFAULT_SETTINGS = {
  schemaVersion: 1,
  dualClockEnabled: false,
  primaryTimeZone: 'system',
  secondaryTimeZone: 'UTC',
};

/**
 * Validate that a time zone string is supported by the runtime.
 * Returns the zone if valid, or 'system' with a console warning if not.
 * The special value 'system' is always valid.
 */
function validateTimeZone(tz) {
  if (tz === 'system') {
    return 'system';
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch (e) {
    console.warn('Invalid time zone "' + tz + '", falling back to system default.');
    return 'system';
  }
}

/**
 * Merge raw stored data with defaults and validate time zones.
 * Returns a safe settings object that is always usable.
 */
function sanitizeSettings(raw) {
  var settings = {};
  settings.schemaVersion = DEFAULT_SETTINGS.schemaVersion;
  settings.dualClockEnabled =
    typeof raw.dualClockEnabled === 'boolean'
      ? raw.dualClockEnabled
      : DEFAULT_SETTINGS.dualClockEnabled;
  settings.primaryTimeZone = validateTimeZone(
    typeof raw.primaryTimeZone === 'string' ? raw.primaryTimeZone : DEFAULT_SETTINGS.primaryTimeZone
  );
  settings.secondaryTimeZone = validateTimeZone(
    typeof raw.secondaryTimeZone === 'string'
      ? raw.secondaryTimeZone
      : DEFAULT_SETTINGS.secondaryTimeZone
  );
  return settings;
}

/**
 * Load settings from chrome.storage.local.
 * Returns a Promise that resolves with a sanitized settings object.
 * Falls back to defaults when chrome.storage is unavailable.
 */
function loadSettings() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return Promise.resolve(sanitizeSettings({}));
  }
  return new Promise(function (resolve) {
    chrome.storage.local.get(SETTINGS_STORAGE_KEY, function (result) {
      var raw = (result && result[SETTINGS_STORAGE_KEY]) || {};
      resolve(sanitizeSettings(raw));
    });
  });
}

/**
 * Save settings to chrome.storage.local.
 * Returns a Promise that resolves when the write completes.
 * No-op when chrome.storage is unavailable.
 */
function saveSettings(settings) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return Promise.resolve();
  }
  var data = {};
  data[SETTINGS_STORAGE_KEY] = settings;
  return new Promise(function (resolve) {
    chrome.storage.local.set(data, function () {
      resolve();
    });
  });
}

/* --- Locale-aware formatting helpers --- */

var _formatterCache = {};

var _timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
var _dateOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

/**
 * Build Intl.DateTimeFormat options with an optional timeZone.
 * When timeZone is undefined the browser's system zone is used.
 */
function _buildOptions(base, timeZone) {
  if (!timeZone) {
    return base;
  }
  var opts = {};
  for (var k in base) {
    if (Object.prototype.hasOwnProperty.call(base, k)) {
      opts[k] = base[k];
    }
  }
  opts.timeZone = timeZone;
  return opts;
}

/**
 * Resolve the "system" sentinel to undefined (omit timeZone from Intl options)
 * and pass through valid IANA identifiers as-is.
 */
function _resolveTimeZone(tz) {
  return tz && tz !== 'system' ? tz : undefined;
}

function _getFormatter(locale, options, cacheKey) {
  var key = (locale || '') + '::' + (options.timeZone || '') + '::' + cacheKey;
  if (!_formatterCache[key]) {
    _formatterCache[key] = new Intl.DateTimeFormat(locale, options);
  }
  return _formatterCache[key];
}

/**
 * Format a Date as a locale-aware time string.
 * Optional timeZone param: IANA identifier, "system", or omitted for system default.
 * Falls back to toLocaleTimeString() if Intl is unavailable.
 */
function formatTime(date, locale, timeZone) {
  try {
    var tz = _resolveTimeZone(timeZone);
    var opts = _buildOptions(_timeOptions, tz);
    return _getFormatter(locale, opts, 'time').format(date);
  } catch (e) {
    return date.toLocaleTimeString();
  }
}

/**
 * Format a Date as a locale-aware date string.
 * Optional timeZone param: IANA identifier, "system", or omitted for system default.
 * Falls back to toLocaleDateString() if Intl is unavailable.
 */
function formatDate(date, locale, timeZone) {
  try {
    var tz = _resolveTimeZone(timeZone);
    var opts = _buildOptions(_dateOptions, tz);
    return _getFormatter(locale, opts, 'date').format(date);
  } catch (e) {
    return date.toLocaleDateString();
  }
}

/**
 * Return a full ISO 8601 UTC timestamp for use in <time datetime>.
 * Example: "2026-02-25T13:45:12.345Z"
 */
function timeDateTimeAttr(date) {
  return date.toISOString();
}

/**
 * Return a calendar ISO date string (YYYY-MM-DD) for a given timezone.
 * When timeZone is omitted or "system", uses local date components.
 * When an IANA timeZone is provided, uses Intl.DateTimeFormat to
 * extract the date as seen in that timezone.
 */
function toLocalISODate(date, timeZone) {
  var tz = _resolveTimeZone(timeZone);
  if (!tz) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }
  try {
    var parts = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    var y = '';
    var m = '';
    var d = '';
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'year') {
        y = parts[i].value;
      }
      if (parts[i].type === 'month') {
        m = parts[i].value;
      }
      if (parts[i].type === 'day') {
        d = parts[i].value;
      }
    }
    return y + '-' + m + '-' + d;
  } catch (e) {
    /* Fallback to system-local if Intl.formatToParts is unavailable */
    return toLocalISODate(date);
  }
}

/* --- Popup lifecycle (browser only) --- */

if (typeof document !== 'undefined') {
  var _intervalId = null;
  var _timeEl = null;
  var _dateEl = null;
  var _secondaryTimeEl = null;
  var _secondaryDateEl = null;
  var _secondaryClockEl = null;
  var _dualClockToggleEl = null;
  var _primaryTzSelectEl = null;
  var _secondaryTzSelectEl = null;
  var _refreshBtn = null;
  var _statusEl = null;
  var _statusClearTimer = null;
  var _warnedMissing = false;
  var _renderErrorLogged = false;
  var _settings = sanitizeSettings({});

  /* Tab navigation elements */
  var _clockTabEl = null;
  var _alarmTabEl = null;
  var _clockViewEl = null;
  var _alarmViewEl = null;

  /* Weather panel element groups */
  var _primaryWeatherEls = null;
  var _secondaryWeatherEls = null;

  /**
   * Update a single clock's time and date <time> elements.
   * timeZone is an IANA identifier or "system" (resolved internally).
   */
  var _renderClock = function _renderClock(timeEl, dateEl, now, timeZone) {
    if (timeEl) {
      var timeText = formatTime(now, undefined, timeZone);
      var timeDt = timeDateTimeAttr(now);
      if (timeEl.textContent !== timeText) {
        timeEl.textContent = timeText;
      }
      if (timeEl.getAttribute('datetime') !== timeDt) {
        timeEl.setAttribute('datetime', timeDt);
      }
    }
    if (dateEl) {
      var dateText = formatDate(now, undefined, timeZone);
      var dateDt = toLocalISODate(now, timeZone);
      if (dateEl.textContent !== dateText) {
        dateEl.textContent = dateText;
      }
      if (dateEl.getAttribute('datetime') !== dateDt) {
        dateEl.setAttribute('datetime', dateDt);
      }
    }
  };

  /**
   * Query all weather panel DOM elements for a given clock prefix.
   * @param {string} prefix - "primary" or "secondary"
   * @returns {{content: Element, icon: Element, city: Element, condition: Element, temp: Element, status: Element, updated: Element}}
   */
  var _queryWeatherEls = function _queryWeatherEls(prefix) {
    return {
      panel: document.getElementById(prefix + 'Weather'),
      content: document.getElementById(prefix + 'WeatherContent'),
      icon: document.getElementById(prefix + 'WeatherIcon'),
      city: document.getElementById(prefix + 'WeatherCity'),
      condition: document.getElementById(prefix + 'WeatherCondition'),
      temp: document.getElementById(prefix + 'WeatherTemp'),
      status: document.getElementById(prefix + 'WeatherStatus'),
      updated: document.getElementById(prefix + 'WeatherUpdated'),
    };
  };

  /**
   * Format a timestamp as a compact "Updated HH:MM" string.
   * @param {number} fetchedAt - Epoch milliseconds
   * @returns {string}
   */
  var _formatUpdatedTime = function _formatUpdatedTime(fetchedAt) {
    var d = new Date(fetchedAt);
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    return 'Updated ' + h + ':' + m;
  };

  /**
   * Update a single clock's weather panel DOM elements.
   * Shows weather data when available, "Weather unavailable" otherwise.
   *
   * @param {object|null} els - Weather element group from _queryWeatherEls
   * @param {{data: object, fetchedAt: number}|null} result - Cache entry from Weather.getWeather
   */
  var _renderWeatherPanel = function _renderWeatherPanel(els, result) {
    if (!els || !els.content) {
      return;
    }

    if (!result || !result.data) {
      /* Error / unavailable state */
      els.content.hidden = true;
      if (els.status) {
        els.status.hidden = false;
        els.status.textContent = 'Weather unavailable';
      }
      if (els.updated) {
        els.updated.textContent = '';
      }
      if (els.panel) {
        delete els.panel.dataset.weatherCategory;
      }
      return;
    }

    var data = result.data;

    /* Populate weather details */
    if (els.city) {
      els.city.textContent = data.city || '';
    }
    if (els.condition) {
      els.condition.textContent = data.condition || '';
    }
    if (els.temp) {
      els.temp.textContent = data.temp !== null ? data.temp + (data.tempUnit || '°C') : '';
    }
    if (els.icon) {
      if (data.icon) {
        els.icon.src = data.icon;
        els.icon.alt = data.condition || 'Weather icon';
      } else {
        els.icon.src = '';
        els.icon.alt = '';
      }
    }

    /* Set condition category for CSS animation */
    if (els.panel && typeof Weather !== 'undefined') {
      els.panel.dataset.weatherCategory = Weather.getConditionCategory(data.condition);
    }

    /* Show content, hide status */
    els.content.hidden = false;
    if (els.status) {
      els.status.hidden = true;
    }
    if (els.updated) {
      els.updated.textContent = _formatUpdatedTime(result.fetchedAt);
    }
  };

  /**
   * Show a non-blocking status message in a weather panel.
   * Used for "API key required" or "Weather unavailable" states.
   *
   * @param {object|null} els - Weather element group from _queryWeatherEls
   * @param {string} message - Status text to display
   */
  var _showWeatherStatus = function _showWeatherStatus(els, message) {
    if (!els || !els.content) {
      return;
    }
    els.content.hidden = true;
    if (els.status) {
      els.status.hidden = false;
      els.status.textContent = message;
    }
    if (els.updated) {
      els.updated.textContent = '';
    }
  };

  /**
   * Fetch and render weather for all visible clocks.
   * Each clock's fetch is independent — one failure does not affect others.
   * No-op if the Weather module is not loaded (e.g. in tests).
   * Shows "API key required" when no key is configured.
   *
   * @param {boolean} [forceRefresh] - True for manual refresh (15s debounce)
   */
  var _refreshWeather = function _refreshWeather(forceRefresh) {
    if (typeof Weather === 'undefined') {
      return;
    }

    Weather.getApiKey().then(function (apiKey) {
      if (!apiKey) {
        _showWeatherStatus(_primaryWeatherEls, 'API key required');
        if (_settings.dualClockEnabled) {
          _showWeatherStatus(_secondaryWeatherEls, 'API key required');
        }
        return;
      }

      /* Primary clock weather — always fetched */
      var primaryLoc = Weather.getWeatherLocation(_settings.primaryTimeZone);
      Weather.getWeather(primaryLoc.lat, primaryLoc.lon, forceRefresh)
        .then(function (result) {
          _renderWeatherPanel(_primaryWeatherEls, result);
        })
        .catch(function (err) {
          console.error('Popup: primary weather error', err && err.message ? err.message : '');
          _renderWeatherPanel(_primaryWeatherEls, null);
        });

      /* Secondary clock weather — only when dual-clock is enabled */
      if (_settings.dualClockEnabled) {
        var secondaryLoc = Weather.getWeatherLocation(_settings.secondaryTimeZone);
        Weather.getWeather(secondaryLoc.lat, secondaryLoc.lon, forceRefresh)
          .then(function (result) {
            _renderWeatherPanel(_secondaryWeatherEls, result);
          })
          .catch(function (err) {
            console.error('Popup: secondary weather error', err && err.message ? err.message : '');
            _renderWeatherPanel(_secondaryWeatherEls, null);
          });
      }
    });
  };

  /**
   * Update all visible clock displays in a single render pass.
   * Accepts an optional Date (defaults to now) for deterministic testing.
   * Catches and logs unexpected errors once to avoid console spam.
   *
   * Accessibility: clock <time> elements are non-live regions — they have
   * no aria-live attribute so screen readers are not spammed every second.
   * The #status live region is intentionally NOT updated here; it is only
   * written to on explicit user-triggered actions (refresh, toggle, tz change).
   */
  var safeRender = function safeRender(now) {
    try {
      if (!now) {
        now = new Date();
      }

      /* Primary clock — always rendered */
      _renderClock(_timeEl, _dateEl, now, _settings.primaryTimeZone);

      /* Secondary clock — only rendered when enabled and visible */
      if (_settings.dualClockEnabled && _secondaryTimeEl) {
        _renderClock(_secondaryTimeEl, _secondaryDateEl, now, _settings.secondaryTimeZone);
      }
    } catch (err) {
      if (!_renderErrorLogged) {
        console.error('Popup: render error', err);
        _renderErrorLogged = true;
      }
    }
  };

  /**
   * Post a polite screen-reader announcement to the #status live region.
   * Clears → sets (via setTimeout 0 to force re-announcement) → auto-clears.
   * Only called on user-triggered actions, never on 1Hz tick updates.
   */
  var _announceStatus = function _announceStatus(message) {
    if (!_statusEl) {
      return;
    }
    if (_statusClearTimer) {
      clearTimeout(_statusClearTimer);
      _statusClearTimer = null;
    }
    _statusEl.textContent = '';
    _statusClearTimer = setTimeout(function () {
      _statusEl.textContent = message;
      _statusClearTimer = setTimeout(function () {
        _statusEl.textContent = '';
        _statusClearTimer = null;
      }, 1000);
    }, 0);
  };

  /**
   * Apply a settings object to the UI controls and internal state.
   * Updates toggle, selects, secondary clock visibility, and re-renders.
   */
  var _applySettings = function _applySettings(settings) {
    _settings = settings;

    if (_dualClockToggleEl) {
      _dualClockToggleEl.checked = _settings.dualClockEnabled;
    }
    if (_primaryTzSelectEl) {
      _primaryTzSelectEl.value = _settings.primaryTimeZone;
    }
    if (_secondaryTzSelectEl) {
      _secondaryTzSelectEl.value = _settings.secondaryTimeZone;
    }
    if (_secondaryClockEl) {
      _secondaryClockEl.hidden = !_settings.dualClockEnabled;
    }

    safeRender();
  };

  /**
   * Switch the active tab and show/hide the corresponding panel.
   * Manages AlarmUI lifecycle: init + refresh on show, destroy on hide.
   *
   * @param {string} tabId - "clockTab" or "alarmTab"
   */
  var _switchTab = function _switchTab(tabId) {
    var isAlarm = tabId === 'alarmTab';

    /* Update tab ARIA state and roving tabindex */
    if (_clockTabEl) {
      _clockTabEl.setAttribute('aria-selected', String(!isAlarm));
      _clockTabEl.tabIndex = isAlarm ? -1 : 0;
    }
    if (_alarmTabEl) {
      _alarmTabEl.setAttribute('aria-selected', String(isAlarm));
      _alarmTabEl.tabIndex = isAlarm ? 0 : -1;
    }

    /* Show/hide panels */
    if (_clockViewEl) {
      _clockViewEl.hidden = isAlarm;
    }
    if (_alarmViewEl) {
      _alarmViewEl.hidden = !isAlarm;
    }

    /* Manage AlarmUI lifecycle */
    if (typeof AlarmUI !== 'undefined') {
      if (isAlarm) {
        AlarmUI.init();
        AlarmUI.refresh();
      } else {
        AlarmUI.destroy();
      }
    }

    _announceStatus(isAlarm ? 'Alarms view' : 'Clock view');
  };

  /**
   * Start the 1-second auto-update ticker.
   * No-op if a ticker is already running (single-interval guard).
   */
  var startTicker = function startTicker() {
    if (_intervalId) {
      return;
    }
    _intervalId = setInterval(function () {
      safeRender();
    }, 1000);
  };

  /**
   * Stop the auto-update ticker.
   * Idempotent — safe to call multiple times.
   */
  var stopTicker = function stopTicker() {
    if (_intervalId) {
      clearInterval(_intervalId);
    }
    _intervalId = null;
  };

  /**
   * Initialise the popup: query DOM elements, perform first render,
   * start the ticker, load persisted settings, and wire up event listeners.
   */
  var initPopup = function initPopup() {
    /* Query clock display elements */
    _timeEl = document.getElementById('timeValue');
    _dateEl = document.getElementById('dateValue');
    _secondaryTimeEl = document.getElementById('secondaryTimeValue');
    _secondaryDateEl = document.getElementById('secondaryDateValue');
    _secondaryClockEl = document.getElementById('secondaryClock');

    /* Query control elements */
    _dualClockToggleEl = document.getElementById('dualClockToggle');
    _primaryTzSelectEl = document.getElementById('primaryTzSelect');
    _secondaryTzSelectEl = document.getElementById('secondaryTzSelect');
    _refreshBtn = document.getElementById('refreshBtn');
    _statusEl = document.getElementById('status');

    if (!_warnedMissing && (!_timeEl || !_dateEl || !_refreshBtn)) {
      var missing = [];
      if (!_timeEl) {
        missing.push('#timeValue');
      }
      if (!_dateEl) {
        missing.push('#dateValue');
      }
      if (!_refreshBtn) {
        missing.push('#refreshBtn');
      }
      console.warn('Popup: missing DOM elements: ' + missing.join(', '));
      _warnedMissing = true;
    }

    /* Query weather panel elements */
    _primaryWeatherEls = _queryWeatherEls('primary');
    _secondaryWeatherEls = _queryWeatherEls('secondary');

    /* API key input elements */
    var apiKeyInput = document.getElementById('weatherApiKeyInput');
    var apiKeySaveBtn = document.getElementById('weatherApiKeySaveBtn');

    /* Pre-fill API key input with masked indicator if a key exists */
    if (apiKeyInput && typeof Weather !== 'undefined') {
      Weather.getApiKey().then(function (key) {
        if (key) {
          apiKeyInput.placeholder = 'Key saved — enter new key to replace';
        }
      });
    }

    /* Save button: persist key, clear cache, re-fetch weather */
    if (apiKeySaveBtn && apiKeyInput) {
      apiKeySaveBtn.addEventListener('click', function () {
        var key = apiKeyInput.value.trim();
        if (!key) {
          return;
        }
        if (typeof Weather !== 'undefined') {
          Weather.setApiKey(key).then(function () {
            apiKeyInput.value = '';
            apiKeyInput.placeholder = 'Key saved — enter new key to replace';
            Weather.clearWeatherCache();
            _refreshWeather(true);
            _announceStatus('Weather API key saved');
          });
        }
      });
    }

    /* Render immediately with defaults, then async-load persisted settings */
    safeRender();
    startTicker();

    loadSettings().then(function (settings) {
      _applySettings(settings);
      _refreshWeather(false);
    });

    /* --- Lifecycle listeners --- */

    window.addEventListener('pagehide', function () {
      stopTicker();
    });

    document.addEventListener('visibilitychange', function () {
      try {
        if (document.visibilityState === 'hidden') {
          stopTicker();
        } else {
          safeRender();
          startTicker();
          _refreshWeather(false);
        }
      } catch (err) {
        console.error('Popup: visibilitychange error', err);
      }
    });

    /* --- Control event listeners (CSP-safe, no inline handlers) --- */

    if (_refreshBtn) {
      _refreshBtn.addEventListener('click', function () {
        try {
          safeRender();
          _refreshWeather(true);
          _announceStatus('Time, date, and weather updated');
        } catch (err) {
          console.error('Popup: refresh error', err);
        }
      });
    }

    if (_dualClockToggleEl) {
      _dualClockToggleEl.addEventListener('change', function () {
        _settings.dualClockEnabled = _dualClockToggleEl.checked;
        if (_secondaryClockEl) {
          _secondaryClockEl.hidden = !_settings.dualClockEnabled;
        }
        saveSettings(_settings);
        safeRender();
        if (_settings.dualClockEnabled) {
          _refreshWeather(false);
        }
        _announceStatus(
          _settings.dualClockEnabled ? 'Second clock enabled' : 'Second clock disabled'
        );
      });
    }

    if (_primaryTzSelectEl) {
      _primaryTzSelectEl.addEventListener('change', function () {
        _settings.primaryTimeZone = _primaryTzSelectEl.value;
        saveSettings(_settings);
        safeRender();
        _refreshWeather(true);
        _announceStatus('Primary time zone changed');
      });
    }

    if (_secondaryTzSelectEl) {
      _secondaryTzSelectEl.addEventListener('change', function () {
        _settings.secondaryTimeZone = _secondaryTzSelectEl.value;
        saveSettings(_settings);
        safeRender();
        if (_settings.dualClockEnabled) {
          _refreshWeather(true);
        }
        _announceStatus('Secondary time zone changed');
      });
    }

    /* --- Tab navigation --- */

    _clockTabEl = document.getElementById('clockTab');
    _alarmTabEl = document.getElementById('alarmTab');
    _clockViewEl = document.getElementById('clockView');
    _alarmViewEl = document.getElementById('alarmView');

    if (_clockTabEl) {
      _clockTabEl.addEventListener('click', function () {
        if (_clockTabEl.getAttribute('aria-selected') !== 'true') {
          _switchTab('clockTab');
          _clockTabEl.focus();
        }
      });
    }

    if (_alarmTabEl) {
      _alarmTabEl.addEventListener('click', function () {
        if (_alarmTabEl.getAttribute('aria-selected') !== 'true') {
          _switchTab('alarmTab');
          _alarmTabEl.focus();
        }
      });
    }

    /* Keyboard navigation: Arrow keys move between tabs (WAI-ARIA Tabs pattern) */
    var tabBar = document.querySelector('[role="tablist"]');
    if (tabBar) {
      tabBar.addEventListener('keydown', function (evt) {
        var tabs = [_clockTabEl, _alarmTabEl];
        var currentIndex = tabs.indexOf(document.activeElement);
        if (currentIndex === -1) {
          return;
        }

        var nextIndex = -1;
        if (evt.key === 'ArrowRight' || evt.key === 'ArrowDown') {
          nextIndex = (currentIndex + 1) % tabs.length;
        } else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowUp') {
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (evt.key === 'Home') {
          nextIndex = 0;
        } else if (evt.key === 'End') {
          nextIndex = tabs.length - 1;
        }

        if (nextIndex !== -1 && nextIndex !== currentIndex) {
          evt.preventDefault();
          _switchTab(tabs[nextIndex].id);
          tabs[nextIndex].focus();
        }
      });
    }
  };

  document.addEventListener('DOMContentLoaded', initPopup);
}

/* --- Testability: export helpers for Node-based test runners --- */

// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && module.exports) {
  // eslint-disable-next-line no-undef
  module.exports = {
    formatTime: formatTime,
    formatDate: formatDate,
    timeDateTimeAttr: timeDateTimeAttr,
    toLocalISODate: toLocalISODate,
    TIMEZONE_OPTIONS: TIMEZONE_OPTIONS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY: SETTINGS_STORAGE_KEY,
    validateTimeZone: validateTimeZone,
    sanitizeSettings: sanitizeSettings,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
  };
}
