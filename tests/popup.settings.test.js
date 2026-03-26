var helpers = require('../src/popup/popup.js');
var TIMEZONE_OPTIONS = helpers.TIMEZONE_OPTIONS;
var DEFAULT_SETTINGS = helpers.DEFAULT_SETTINGS;
var SETTINGS_STORAGE_KEY = helpers.SETTINGS_STORAGE_KEY;
var validateTimeZone = helpers.validateTimeZone;
var sanitizeSettings = helpers.sanitizeSettings;
var loadSettings = helpers.loadSettings;
var saveSettings = helpers.saveSettings;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

describe('TIMEZONE_OPTIONS', function () {
  it('is an array of objects with value and label', function () {
    expect(Array.isArray(TIMEZONE_OPTIONS)).toBe(true);
    TIMEZONE_OPTIONS.forEach(function (opt) {
      expect(typeof opt.value).toBe('string');
      expect(typeof opt.label).toBe('string');
    });
  });

  it('includes System default as the first entry', function () {
    expect(TIMEZONE_OPTIONS[0].value).toBe('system');
    expect(TIMEZONE_OPTIONS[0].label).toBe('System default');
  });

  it('includes UTC', function () {
    expect(
      TIMEZONE_OPTIONS.some(function (opt) {
        return opt.value === 'UTC';
      })
    ).toBe(true);
  });

  it('includes Asia/Colombo and Europe/London', function () {
    var values = TIMEZONE_OPTIONS.map(function (opt) {
      return opt.value;
    });
    expect(values).toContain('Asia/Colombo');
    expect(values).toContain('Europe/London');
  });

  it('contains at least 10 entries', function () {
    expect(TIMEZONE_OPTIONS.length).toBeGreaterThanOrEqual(10);
  });
});

describe('DEFAULT_SETTINGS', function () {
  it('has schemaVersion 1', function () {
    expect(DEFAULT_SETTINGS.schemaVersion).toBe(1);
  });

  it('has dualClockEnabled false', function () {
    expect(DEFAULT_SETTINGS.dualClockEnabled).toBe(false);
  });

  it('has primaryTimeZone set to system', function () {
    expect(DEFAULT_SETTINGS.primaryTimeZone).toBe('system');
  });

  it('has secondaryTimeZone set to UTC', function () {
    expect(DEFAULT_SETTINGS.secondaryTimeZone).toBe('UTC');
  });
});

describe('SETTINGS_STORAGE_KEY', function () {
  it('is a non-empty string', function () {
    expect(typeof SETTINGS_STORAGE_KEY).toBe('string');
    expect(SETTINGS_STORAGE_KEY.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  validateTimeZone                                                   */
/* ------------------------------------------------------------------ */

describe('validateTimeZone', function () {
  it('returns "system" unchanged', function () {
    expect(validateTimeZone('system')).toBe('system');
  });

  it('returns a valid IANA time zone unchanged', function () {
    expect(validateTimeZone('UTC')).toBe('UTC');
    expect(validateTimeZone('America/New_York')).toBe('America/New_York');
    expect(validateTimeZone('Asia/Colombo')).toBe('Asia/Colombo');
  });

  it('returns "system" for an invalid time zone', function () {
    var warnSpy = jest.spyOn(console, 'warn').mockImplementation(function () {});
    expect(validateTimeZone('Invalid/Zone')).toBe('system');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/Invalid\/Zone/);
    warnSpy.mockRestore();
  });

  it('returns "system" for an empty string', function () {
    var warnSpy = jest.spyOn(console, 'warn').mockImplementation(function () {});
    expect(validateTimeZone('')).toBe('system');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/*  sanitizeSettings                                                   */
/* ------------------------------------------------------------------ */

describe('sanitizeSettings', function () {
  it('returns defaults when given an empty object', function () {
    var result = sanitizeSettings({});
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('preserves valid stored values', function () {
    var stored = {
      schemaVersion: 1,
      dualClockEnabled: true,
      primaryTimeZone: 'Europe/London',
      secondaryTimeZone: 'Asia/Tokyo',
    };
    var result = sanitizeSettings(stored);
    expect(result.dualClockEnabled).toBe(true);
    expect(result.primaryTimeZone).toBe('Europe/London');
    expect(result.secondaryTimeZone).toBe('Asia/Tokyo');
  });

  it('falls back to defaults for wrong types', function () {
    var result = sanitizeSettings({
      dualClockEnabled: 'yes',
      primaryTimeZone: 42,
      secondaryTimeZone: null,
    });
    expect(result.dualClockEnabled).toBe(false);
    expect(result.primaryTimeZone).toBe('system');
    expect(result.secondaryTimeZone).toBe('UTC');
  });

  it('validates and falls back for invalid time zones', function () {
    var warnSpy = jest.spyOn(console, 'warn').mockImplementation(function () {});
    var result = sanitizeSettings({
      primaryTimeZone: 'Fake/City',
      secondaryTimeZone: 'Also/Fake',
    });
    expect(result.primaryTimeZone).toBe('system');
    expect(result.secondaryTimeZone).toBe('system');
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('always sets schemaVersion to current default', function () {
    var result = sanitizeSettings({ schemaVersion: 99 });
    expect(result.schemaVersion).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  loadSettings / saveSettings (no chrome.storage available)          */
/* ------------------------------------------------------------------ */

describe('loadSettings (without chrome.storage)', function () {
  it('resolves with default settings', function () {
    return loadSettings().then(function (settings) {
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });
});

describe('saveSettings (without chrome.storage)', function () {
  it('resolves without error', function () {
    return saveSettings(DEFAULT_SETTINGS).then(function (result) {
      expect(result).toBeUndefined();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  loadSettings / saveSettings (with mocked chrome.storage)           */
/* ------------------------------------------------------------------ */

describe('loadSettings (with mocked chrome.storage)', function () {
  var originalChrome;

  beforeEach(function () {
    originalChrome = globalThis.chrome;
  });

  afterEach(function () {
    globalThis.chrome = originalChrome;
  });

  it('loads and sanitizes stored settings', function () {
    var stored = {
      dualClockEnabled: true,
      primaryTimeZone: 'Asia/Colombo',
      secondaryTimeZone: 'Europe/London',
    };
    globalThis.chrome = {
      storage: {
        local: {
          get: function (key, cb) {
            var result = {};
            result[key] = stored;
            cb(result);
          },
        },
      },
    };
    return loadSettings().then(function (settings) {
      expect(settings.dualClockEnabled).toBe(true);
      expect(settings.primaryTimeZone).toBe('Asia/Colombo');
      expect(settings.secondaryTimeZone).toBe('Europe/London');
      expect(settings.schemaVersion).toBe(1);
    });
  });

  it('returns defaults when storage is empty', function () {
    globalThis.chrome = {
      storage: {
        local: {
          get: function (key, cb) {
            cb({});
          },
        },
      },
    };
    return loadSettings().then(function (settings) {
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });
});

describe('saveSettings (with mocked chrome.storage)', function () {
  var originalChrome;

  beforeEach(function () {
    originalChrome = globalThis.chrome;
  });

  afterEach(function () {
    globalThis.chrome = originalChrome;
  });

  it('writes settings under the correct storage key', function () {
    var savedData = null;
    globalThis.chrome = {
      storage: {
        local: {
          set: function (data, cb) {
            savedData = data;
            cb();
          },
        },
      },
    };
    var settings = {
      schemaVersion: 1,
      dualClockEnabled: true,
      primaryTimeZone: 'UTC',
      secondaryTimeZone: 'Asia/Tokyo',
    };
    return saveSettings(settings).then(function () {
      expect(savedData).not.toBeNull();
      expect(savedData[SETTINGS_STORAGE_KEY]).toEqual(settings);
    });
  });
});
