/* --- Locale-aware formatting helpers --- */

var _formatterCache = {};

var _timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
var _dateOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

function _getFormatter(locale, options, cacheKey) {
  var key = (locale || '') + '::' + cacheKey;
  if (!_formatterCache[key]) {
    _formatterCache[key] = new Intl.DateTimeFormat(locale, options);
  }
  return _formatterCache[key];
}

/**
 * Format a Date as a locale-aware time string.
 * Falls back to toLocaleTimeString() if Intl is unavailable.
 */
function formatTime(date, locale) {
  try {
    return _getFormatter(locale, _timeOptions, 'time').format(date);
  } catch (e) {
    return date.toLocaleTimeString();
  }
}

/**
 * Format a Date as a locale-aware date string.
 * Falls back to toLocaleDateString() if Intl is unavailable.
 */
function formatDate(date, locale) {
  try {
    return _getFormatter(locale, _dateOptions, 'date').format(date);
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
 * Return a local-calendar ISO date string (YYYY-MM-DD).
 * Derived from local date components, not UTC, to avoid
 * date shifts near midnight in non-UTC timezones.
 */
function toLocalISODate(date) {
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

/* --- Popup lifecycle (browser only) --- */

if (typeof document !== 'undefined') {
  var _intervalId = null;
  var _timeEl = null;
  var _dateEl = null;
  var _refreshBtn = null;
  var _statusEl = null;

  /**
   * Update the time and date display elements.
   * Accepts an optional Date (defaults to now) for deterministic testing.
   */
  var safeRender = function safeRender(now) {
    if (!now) {
      now = new Date();
    }

    if (_timeEl) {
      _timeEl.textContent = formatTime(now);
      _timeEl.setAttribute('datetime', timeDateTimeAttr(now));
    }
    if (_dateEl) {
      _dateEl.textContent = formatDate(now);
      _dateEl.setAttribute('datetime', toLocalISODate(now));
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
    _refreshBtn = document.getElementById('refreshBtn');
    _statusEl = document.getElementById('status');

    if (!_timeEl || !_dateEl || !_refreshBtn) {
      console.warn('Popup: Required DOM elements not found');
    }

    safeRender();
    startTicker();

    window.addEventListener('beforeunload', function () {
      stopTicker();
    });

    if (_refreshBtn) {
      _refreshBtn.addEventListener('click', function () {
        safeRender();
        if (_statusEl) {
          _statusEl.textContent = 'Time and date updated';
          setTimeout(function () {
            _statusEl.textContent = '';
          }, 1000);
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
  };
}
