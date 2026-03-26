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

/* --- Popup initialisation (browser only) --- */

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    var timeEl = document.getElementById('timeValue');
    var dateEl = document.getElementById('dateValue');
    var refreshBtn = document.getElementById('refreshBtn');
    var statusEl = document.getElementById('status');

    var intervalId = null;

    if (!timeEl || !dateEl || !refreshBtn) {
      console.error('Popup: Required DOM elements not found');
      return;
    }

    function render(now) {
      if (!now) {
        now = new Date();
      }

      timeEl.textContent = formatTime(now);
      dateEl.textContent = formatDate(now);
      timeEl.setAttribute('datetime', timeDateTimeAttr(now));
      dateEl.setAttribute('datetime', toLocalISODate(now));
    }

    function startTimer() {
      if (intervalId) {
        clearInterval(intervalId);
      }
      intervalId = setInterval(function () {
        render();
      }, 1000);
    }

    render();
    startTimer();

    refreshBtn.addEventListener('click', function () {
      render();
      if (statusEl) {
        statusEl.textContent = 'Time and date updated';
        setTimeout(function () {
          statusEl.textContent = '';
        }, 1000);
      }
    });
  });
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
