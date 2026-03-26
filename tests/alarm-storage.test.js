var storage = require('../src/alarm-storage.js');

var ALARM_STORAGE_KEY = storage.ALARM_STORAGE_KEY;
var SNOOZE_STORAGE_KEY = storage.SNOOZE_STORAGE_KEY;
var ALARM_SCHEMA_VERSION = storage.ALARM_SCHEMA_VERSION;
var MAX_LABEL_LENGTH = storage.MAX_LABEL_LENGTH;
var generateId = storage.generateId;
var validateAlarm = storage.validateAlarm;
var sanitizeAlarm = storage.sanitizeAlarm;
var computeNextFireAt = storage.computeNextFireAt;
var migrateAlarms = storage.migrateAlarms;
var migrateSnoozes = storage.migrateSnoozes;
var loadAlarms = storage.loadAlarms;
var saveAlarms = storage.saveAlarms;
var getAlarm = storage.getAlarm;
var createAlarm = storage.createAlarm;
var updateAlarm = storage.updateAlarm;
var deleteAlarm = storage.deleteAlarm;
var loadSnoozes = storage.loadSnoozes;
var saveSnoozes = storage.saveSnoozes;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

describe('constants', function () {
  it('exports storage keys as non-empty strings', function () {
    expect(typeof ALARM_STORAGE_KEY).toBe('string');
    expect(ALARM_STORAGE_KEY.length).toBeGreaterThan(0);
    expect(typeof SNOOZE_STORAGE_KEY).toBe('string');
    expect(SNOOZE_STORAGE_KEY.length).toBeGreaterThan(0);
  });

  it('exports schema version as a positive integer', function () {
    expect(ALARM_SCHEMA_VERSION).toBe(1);
  });

  it('exports MAX_LABEL_LENGTH as 50', function () {
    expect(MAX_LABEL_LENGTH).toBe(50);
  });
});

/* ------------------------------------------------------------------ */
/*  generateId                                                         */
/* ------------------------------------------------------------------ */

describe('generateId', function () {
  it('returns a non-empty string', function () {
    var id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns unique values on successive calls', function () {
    var ids = new Set();
    for (var i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('contains a hyphen separator', function () {
    expect(generateId()).toMatch(/-/);
  });
});

/* ------------------------------------------------------------------ */
/*  validateAlarm                                                      */
/* ------------------------------------------------------------------ */

describe('validateAlarm', function () {
  /** Returns a valid alarm object for merging with overrides. */
  function goodAlarm(overrides) {
    return Object.assign(
      { hour: 8, minute: 30, label: 'Wake up', enabled: true, repeatDays: [1, 2, 3, 4, 5] },
      overrides || {}
    );
  }

  it('passes for a valid alarm', function () {
    var result = validateAlarm(goodAlarm());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes with minimal fields (hour and minute only)', function () {
    var result = validateAlarm({ hour: 0, minute: 0 });
    expect(result.valid).toBe(true);
  });

  it('fails for null input', function () {
    var result = validateAlarm(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/object/);
  });

  it('fails for non-object input', function () {
    var result = validateAlarm('not an object');
    expect(result.valid).toBe(false);
  });

  // hour
  it('fails when hour is missing', function () {
    var result = validateAlarm({ minute: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.join(',')).toMatch(/hour/);
  });

  it('fails when hour is negative', function () {
    var result = validateAlarm(goodAlarm({ hour: -1 }));
    expect(result.valid).toBe(false);
  });

  it('fails when hour is 24', function () {
    var result = validateAlarm(goodAlarm({ hour: 24 }));
    expect(result.valid).toBe(false);
  });

  it('fails when hour is a float', function () {
    var result = validateAlarm(goodAlarm({ hour: 8.5 }));
    expect(result.valid).toBe(false);
  });

  it('fails when hour is a string', function () {
    var result = validateAlarm(goodAlarm({ hour: '8' }));
    expect(result.valid).toBe(false);
  });

  // minute
  it('fails when minute is missing', function () {
    var result = validateAlarm({ hour: 8 });
    expect(result.valid).toBe(false);
    expect(result.errors.join(',')).toMatch(/minute/);
  });

  it('fails when minute is 60', function () {
    var result = validateAlarm(goodAlarm({ minute: 60 }));
    expect(result.valid).toBe(false);
  });

  it('fails when minute is negative', function () {
    var result = validateAlarm(goodAlarm({ minute: -1 }));
    expect(result.valid).toBe(false);
  });

  // label
  it('passes when label is omitted', function () {
    var data = goodAlarm();
    delete data.label;
    expect(validateAlarm(data).valid).toBe(true);
  });

  it('passes when label is empty string', function () {
    expect(validateAlarm(goodAlarm({ label: '' })).valid).toBe(true);
  });

  it('fails when label is too long', function () {
    var result = validateAlarm(goodAlarm({ label: 'a'.repeat(51) }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(',')).toMatch(/label/);
  });

  it('passes when label is exactly max length', function () {
    expect(validateAlarm(goodAlarm({ label: 'a'.repeat(50) })).valid).toBe(true);
  });

  it('fails when label is not a string', function () {
    expect(validateAlarm(goodAlarm({ label: 42 })).valid).toBe(false);
  });

  // enabled
  it('fails when enabled is not a boolean', function () {
    expect(validateAlarm(goodAlarm({ enabled: 'yes' })).valid).toBe(false);
  });

  // repeatDays
  it('passes with empty repeatDays (one-time alarm)', function () {
    expect(validateAlarm(goodAlarm({ repeatDays: [] })).valid).toBe(true);
  });

  it('fails when repeatDays contains invalid day 7', function () {
    var result = validateAlarm(goodAlarm({ repeatDays: [0, 7] }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(',')).toMatch(/repeatDays/);
  });

  it('fails when repeatDays contains negative value', function () {
    expect(validateAlarm(goodAlarm({ repeatDays: [-1] })).valid).toBe(false);
  });

  it('fails when repeatDays contains duplicates', function () {
    expect(validateAlarm(goodAlarm({ repeatDays: [1, 1] })).valid).toBe(false);
  });

  it('fails when repeatDays is not an array', function () {
    expect(validateAlarm(goodAlarm({ repeatDays: 'daily' })).valid).toBe(false);
  });

  it('collects multiple errors at once', function () {
    var result = validateAlarm({ hour: -1, minute: 99, label: 42 });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

/* ------------------------------------------------------------------ */
/*  sanitizeAlarm                                                      */
/* ------------------------------------------------------------------ */

describe('sanitizeAlarm', function () {
  it('returns defaults for empty input', function () {
    var result = sanitizeAlarm({});
    expect(result).toEqual({
      hour: 0,
      minute: 0,
      label: '',
      enabled: true,
      repeatDays: [],
    });
  });

  it('returns defaults for null input', function () {
    var result = sanitizeAlarm(null);
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });

  it('preserves valid fields', function () {
    var result = sanitizeAlarm({
      hour: 14,
      minute: 30,
      label: 'Lunch',
      enabled: false,
      repeatDays: [1, 3, 5],
    });
    expect(result.hour).toBe(14);
    expect(result.minute).toBe(30);
    expect(result.label).toBe('Lunch');
    expect(result.enabled).toBe(false);
    expect(result.repeatDays).toEqual([1, 3, 5]);
  });

  it('clamps hour to 0–23', function () {
    expect(sanitizeAlarm({ hour: -5 }).hour).toBe(0);
    expect(sanitizeAlarm({ hour: 99 }).hour).toBe(23);
  });

  it('clamps minute to 0–59', function () {
    expect(sanitizeAlarm({ minute: -1 }).minute).toBe(0);
    expect(sanitizeAlarm({ minute: 100 }).minute).toBe(59);
  });

  it('trims and truncates label', function () {
    expect(sanitizeAlarm({ label: '  hello  ' }).label).toBe('hello');
    expect(sanitizeAlarm({ label: 'a'.repeat(100) }).label).toBe('a'.repeat(50));
  });

  it('falls back to empty label for non-string', function () {
    expect(sanitizeAlarm({ label: 42 }).label).toBe('');
  });

  it('falls back to true for non-boolean enabled', function () {
    expect(sanitizeAlarm({ enabled: 'yes' }).enabled).toBe(true);
  });

  it('filters invalid day values from repeatDays', function () {
    expect(sanitizeAlarm({ repeatDays: [0, 7, -1, 3, 'Mon'] }).repeatDays).toEqual([0, 3]);
  });

  it('deduplicates and sorts repeatDays', function () {
    expect(sanitizeAlarm({ repeatDays: [5, 1, 3, 1] }).repeatDays).toEqual([1, 3, 5]);
  });

  it('falls back to empty array for non-array repeatDays', function () {
    expect(sanitizeAlarm({ repeatDays: 'daily' }).repeatDays).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  computeNextFireAt                                                  */
/* ------------------------------------------------------------------ */

describe('computeNextFireAt', function () {
  // Fixed reference: Wednesday 2026-03-25 at 10:00:00 local time
  var wednesday10am = new Date(2026, 2, 25, 10, 0, 0, 0);

  it('returns null for disabled alarms', function () {
    var alarm = { hour: 8, minute: 0, enabled: false, repeatDays: [] };
    expect(computeNextFireAt(alarm, wednesday10am)).toBeNull();
  });

  // One-time alarms
  it('returns today for a one-time alarm still in the future', function () {
    var alarm = { hour: 14, minute: 30, enabled: true, repeatDays: [] };
    var result = new Date(computeNextFireAt(alarm, wednesday10am));
    expect(result.getDate()).toBe(25);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
  });

  it('returns tomorrow for a one-time alarm already passed today', function () {
    var alarm = { hour: 8, minute: 0, enabled: true, repeatDays: [] };
    var result = new Date(computeNextFireAt(alarm, wednesday10am));
    expect(result.getDate()).toBe(26);
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(0);
  });

  it('returns tomorrow for a one-time alarm at the exact current time', function () {
    var alarm = { hour: 10, minute: 0, enabled: true, repeatDays: [] };
    var result = new Date(computeNextFireAt(alarm, wednesday10am));
    expect(result.getDate()).toBe(26);
  });

  // Repeating alarms
  it('returns the same day for a repeating alarm later today', function () {
    // Wednesday = day 3
    var alarm = { hour: 14, minute: 0, enabled: true, repeatDays: [3] };
    var result = new Date(computeNextFireAt(alarm, wednesday10am));
    expect(result.getDate()).toBe(25);
    expect(result.getHours()).toBe(14);
  });

  it('returns next matching day when today is already passed', function () {
    // Wednesday = day 3, alarm at 8am already passed, next matching is Friday (5)
    var alarm = { hour: 8, minute: 0, enabled: true, repeatDays: [5] };
    var result = new Date(computeNextFireAt(alarm, wednesday10am));
    expect(result.getDay()).toBe(5); // Friday
    expect(result.getDate()).toBe(27);
  });

  it('skips to next week when all repeat days have passed this week', function () {
    // Wednesday 10am, alarm for Monday (1) at 8am — next Monday
    var alarm = { hour: 8, minute: 0, enabled: true, repeatDays: [1] };
    var result = new Date(computeNextFireAt(alarm, wednesday10am));
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(30); // Next Monday
  });

  it('handles Mon-Fri weekday alarm', function () {
    // Wednesday 10am, next weekday at 8am is Thursday
    var alarm = { hour: 8, minute: 0, enabled: true, repeatDays: [1, 2, 3, 4, 5] };
    var result = new Date(computeNextFireAt(alarm, wednesday10am));
    expect(result.getDay()).toBe(4); // Thursday
    expect(result.getDate()).toBe(26);
  });

  it('returns a valid ISO string', function () {
    var alarm = { hour: 12, minute: 0, enabled: true, repeatDays: [] };
    var result = computeNextFireAt(alarm, wednesday10am);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('defaults to current time when now is not provided', function () {
    var alarm = { hour: 23, minute: 59, enabled: true, repeatDays: [] };
    var result = computeNextFireAt(alarm);
    expect(typeof result).toBe('string');
  });
});

/* ------------------------------------------------------------------ */
/*  migrateAlarms                                                      */
/* ------------------------------------------------------------------ */

describe('migrateAlarms', function () {
  it('returns empty alarms for null input', function () {
    var result = migrateAlarms(null);
    expect(result.schemaVersion).toBe(ALARM_SCHEMA_VERSION);
    expect(result.alarms).toEqual([]);
  });

  it('returns empty alarms for undefined input', function () {
    var result = migrateAlarms(undefined);
    expect(result.alarms).toEqual([]);
  });

  it('returns empty alarms for missing schemaVersion', function () {
    var result = migrateAlarms({ alarms: [{ hour: 8, minute: 0 }] });
    expect(result.alarms).toEqual([]);
  });

  it('passes through version 1 data', function () {
    var data = { schemaVersion: 1, alarms: [{ id: 'a', hour: 9, minute: 0 }] };
    var result = migrateAlarms(data);
    expect(result.schemaVersion).toBe(1);
    expect(result.alarms).toHaveLength(1);
    expect(result.alarms[0].id).toBe('a');
  });

  it('preserves data from future schema versions with a warning', function () {
    var warnSpy = jest.spyOn(console, 'warn').mockImplementation(function () {});
    var data = { schemaVersion: 99, alarms: [{ id: 'future' }] };
    var result = migrateAlarms(data);
    expect(result.schemaVersion).toBe(99);
    expect(result.alarms).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('defaults alarms to empty array when missing', function () {
    var result = migrateAlarms({ schemaVersion: 1 });
    expect(result.alarms).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  migrateSnoozes                                                     */
/* ------------------------------------------------------------------ */

describe('migrateSnoozes', function () {
  it('returns empty snoozes for null input', function () {
    var result = migrateSnoozes(null);
    expect(result.schemaVersion).toBe(ALARM_SCHEMA_VERSION);
    expect(result.snoozes).toEqual([]);
  });

  it('passes through version 1 data', function () {
    var data = {
      schemaVersion: 1,
      snoozes: [{ alarmId: 'x', snoozeUntil: '2026-01-01T00:00:00Z' }],
    };
    var result = migrateSnoozes(data);
    expect(result.snoozes).toHaveLength(1);
  });

  it('preserves data from future schema versions', function () {
    var warnSpy = jest.spyOn(console, 'warn').mockImplementation(function () {});
    var result = migrateSnoozes({ schemaVersion: 99, snoozes: [] });
    expect(result.schemaVersion).toBe(99);
    warnSpy.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/*  loadAlarms / saveAlarms — without chrome.storage                   */
/* ------------------------------------------------------------------ */

describe('loadAlarms (without chrome.storage)', function () {
  it('resolves with empty array', function () {
    return loadAlarms().then(function (alarms) {
      expect(alarms).toEqual([]);
    });
  });
});

describe('saveAlarms (without chrome.storage)', function () {
  it('resolves without error', function () {
    return saveAlarms([]).then(function (result) {
      expect(result).toBeUndefined();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  loadSnoozes / saveSnoozes — without chrome.storage                 */
/* ------------------------------------------------------------------ */

describe('loadSnoozes (without chrome.storage)', function () {
  it('resolves with empty array', function () {
    return loadSnoozes().then(function (snoozes) {
      expect(snoozes).toEqual([]);
    });
  });
});

describe('saveSnoozes (without chrome.storage)', function () {
  it('resolves without error', function () {
    return saveSnoozes([]).then(function (result) {
      expect(result).toBeUndefined();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  CRUD with mocked chrome.storage                                    */
/* ------------------------------------------------------------------ */

describe('CRUD with mocked chrome.storage', function () {
  var originalChrome;
  var mockStore;

  beforeEach(function () {
    originalChrome = globalThis.chrome;
    mockStore = {};
    globalThis.chrome = {
      storage: {
        local: {
          get: function (key, cb) {
            var result = {};
            result[key] = mockStore[key];
            cb(result);
          },
          set: function (data, cb) {
            Object.keys(data).forEach(function (k) {
              mockStore[k] = data[k];
            });
            cb();
          },
        },
      },
    };
  });

  afterEach(function () {
    globalThis.chrome = originalChrome;
  });

  it('creates and loads an alarm', function () {
    return createAlarm({ hour: 7, minute: 30, label: 'Morning' }).then(function (alarm) {
      expect(alarm.id).toBeTruthy();
      expect(alarm.hour).toBe(7);
      expect(alarm.minute).toBe(30);
      expect(alarm.label).toBe('Morning');
      expect(alarm.enabled).toBe(true);
      expect(alarm.createdAt).toBeTruthy();
      expect(alarm.nextFireAt).toBeTruthy();

      return loadAlarms().then(function (alarms) {
        expect(alarms).toHaveLength(1);
        expect(alarms[0].id).toBe(alarm.id);
      });
    });
  });

  it('rejects creation with invalid data', function () {
    return createAlarm({ hour: 25, minute: 0 }).then(
      function () {
        throw new Error('should have rejected');
      },
      function (err) {
        expect(err.message).toMatch(/hour/);
      }
    );
  });

  it('updates an alarm', function () {
    var createTime = new Date('2026-01-01T10:00:00Z');
    var updateTime = new Date('2026-01-01T11:00:00Z');
    return createAlarm({ hour: 8, minute: 0 }, createTime).then(function (alarm) {
      return updateAlarm(alarm.id, { hour: 9, label: 'Updated' }, updateTime).then(
        function (updated) {
          expect(updated.hour).toBe(9);
          expect(updated.label).toBe('Updated');
          expect(updated.id).toBe(alarm.id);
          expect(updated.createdAt).toBe(alarm.createdAt);
          expect(updated.updatedAt).toBe(updateTime.toISOString());
          expect(updated.updatedAt).not.toBe(alarm.updatedAt);
        }
      );
    });
  });

  it('rejects update for non-existent alarm', function () {
    return updateAlarm('nonexistent', { hour: 10 }).then(
      function () {
        throw new Error('should have rejected');
      },
      function (err) {
        expect(err.message).toMatch(/not found/i);
      }
    );
  });

  it('rejects update with invalid data', function () {
    return createAlarm({ hour: 8, minute: 0 }).then(function (alarm) {
      return updateAlarm(alarm.id, { hour: -1 }).then(
        function () {
          throw new Error('should have rejected');
        },
        function (err) {
          expect(err.message).toMatch(/hour/);
        }
      );
    });
  });

  it('gets a single alarm by ID', function () {
    return createAlarm({ hour: 12, minute: 0 }).then(function (alarm) {
      return getAlarm(alarm.id).then(function (found) {
        expect(found).not.toBeNull();
        expect(found.id).toBe(alarm.id);
      });
    });
  });

  it('returns null for non-existent alarm ID', function () {
    return getAlarm('nope').then(function (found) {
      expect(found).toBeNull();
    });
  });

  it('deletes an alarm', function () {
    return createAlarm({ hour: 6, minute: 0 }).then(function (alarm) {
      return deleteAlarm(alarm.id).then(function () {
        return loadAlarms().then(function (alarms) {
          expect(alarms).toHaveLength(0);
        });
      });
    });
  });

  it('handles multiple alarms', function () {
    return createAlarm({ hour: 6, minute: 0 })
      .then(function () {
        return createAlarm({ hour: 7, minute: 0 });
      })
      .then(function () {
        return createAlarm({ hour: 8, minute: 0 });
      })
      .then(function () {
        return loadAlarms();
      })
      .then(function (alarms) {
        expect(alarms).toHaveLength(3);
      });
  });

  it('saves and loads snoozes', function () {
    var snoozes = [{ alarmId: 'abc', snoozeUntil: '2026-01-01T00:05:00Z', notificationId: 'n1' }];
    return saveSnoozes(snoozes)
      .then(function () {
        return loadSnoozes();
      })
      .then(function (loaded) {
        expect(loaded).toHaveLength(1);
        expect(loaded[0].alarmId).toBe('abc');
        expect(loaded[0].snoozeUntil).toBe('2026-01-01T00:05:00Z');
        expect(loaded[0].notificationId).toBe('n1');
      });
  });

  it('sanitizes snooze fields on load', function () {
    mockStore[SNOOZE_STORAGE_KEY] = {
      schemaVersion: 1,
      snoozes: [{ alarmId: 42, snoozeUntil: null, extra: true }],
    };
    return loadSnoozes().then(function (loaded) {
      expect(loaded[0].alarmId).toBe('');
      expect(loaded[0].snoozeUntil).toBe('');
      expect(loaded[0].notificationId).toBeNull();
      expect(loaded[0].extra).toBeUndefined();
    });
  });

  it('recalculates nextFireAt on update with enable/disable', function () {
    return createAlarm({ hour: 15, minute: 0 }).then(function (alarm) {
      expect(alarm.nextFireAt).toBeTruthy();
      return updateAlarm(alarm.id, { enabled: false }).then(function (disabled) {
        expect(disabled.nextFireAt).toBeNull();
        return updateAlarm(alarm.id, { enabled: true }).then(function (reEnabled) {
          expect(reEnabled.nextFireAt).toBeTruthy();
        });
      });
    });
  });
});

/* ------------------------------------------------------------------ */
/*  loadAlarms — sanitization on load                                  */
/* ------------------------------------------------------------------ */

describe('loadAlarms sanitization', function () {
  var originalChrome;

  beforeEach(function () {
    originalChrome = globalThis.chrome;
  });

  afterEach(function () {
    globalThis.chrome = originalChrome;
  });

  it('sanitizes corrupted alarm data on load', function () {
    var stored = {
      schemaVersion: 1,
      alarms: [
        {
          id: 'test-1',
          hour: 999,
          minute: -5,
          label: 42,
          enabled: 'yes',
          repeatDays: 'daily',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
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
    return loadAlarms().then(function (alarms) {
      expect(alarms).toHaveLength(1);
      expect(alarms[0].id).toBe('test-1');
      expect(alarms[0].hour).toBe(23); // clamped from 999
      expect(alarms[0].minute).toBe(0); // clamped from -5
      expect(alarms[0].label).toBe(''); // non-string fallback
      expect(alarms[0].enabled).toBe(true); // non-boolean fallback
      expect(alarms[0].repeatDays).toEqual([]); // non-array fallback
    });
  });

  it('generates ID for alarms missing one', function () {
    var stored = {
      schemaVersion: 1,
      alarms: [{ hour: 8, minute: 0, createdAt: '2026-01-01T00:00:00Z' }],
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
    return loadAlarms().then(function (alarms) {
      expect(alarms[0].id).toBeTruthy();
      expect(typeof alarms[0].id).toBe('string');
    });
  });
});
