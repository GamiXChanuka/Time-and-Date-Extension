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
  var _refreshBtn = null;
  var _statusEl = null;
  var _statusClearTimer = null;
  var _warnedMissing = false;
  var _renderErrorLogged = false;
  var _settings = sanitizeSettings({});

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
   * Update all visible clock displays in a single render pass.
   * Accepts an optional Date (defaults to now) for deterministic testing.
   * Catches and logs unexpected errors once to avoid console spam.
   *
   * Accessibility: clock <time> elements are non-live regions — they have
   * no aria-live attribute so screen readers are not spammed every second.
   * The #status live region is intentionally NOT updated here; it is only
   * written to on explicit user-triggered refresh (see initPopup click handler).
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
   * start the ticker, and wire up event listeners.
   */
  var initPopup = function initPopup() {
    _timeEl = document.getElementById('timeValue');
    _dateEl = document.getElementById('dateValue');
    _secondaryTimeEl = document.getElementById('secondaryTimeValue');
    _secondaryDateEl = document.getElementById('secondaryDateValue');
    _secondaryClockEl = document.getElementById('secondaryClock');
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

    safeRender();
    startTicker();

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
        }
      } catch (err) {
        console.error('Popup: visibilitychange error', err);
      }
    });

    if (_refreshBtn) {
      _refreshBtn.addEventListener('click', function () {
        try {
          safeRender();
          if (_statusEl) {
            /* Cancel any pending clear so rapid clicks don't race */
            if (_statusClearTimer) {
              clearTimeout(_statusClearTimer);
              _statusClearTimer = null;
            }
            /*
             * Clear then re-set the status text so screen readers
             * re-announce even when the message is the same string.
             * The brief empty value forces a DOM change that triggers
             * a new polite announcement on the next content write.
             */
            _statusEl.textContent = '';
            _statusClearTimer = setTimeout(function () {
              _statusEl.textContent = 'Time and date updated';
              _statusClearTimer = setTimeout(function () {
                _statusEl.textContent = '';
                _statusClearTimer = null;
              }, 1000);
            }, 0);
          }
        } catch (err) {
          console.error('Popup: refresh error', err);
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
