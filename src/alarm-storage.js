/**
 * Alarm Clock — data model and persistence layer.
 *
 * Provides CRUD operations for alarms and snoozes backed by
 * chrome.storage.local.  All public functions return Promises and
 * fall back gracefully when chrome.storage is unavailable (tests).
 *
 * Storage keys:
 *   alarmClockAlarms  — { schemaVersion, alarms[] }
 *   alarmClockSnoozes — { schemaVersion, snoozes[] }
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

var ALARM_STORAGE_KEY = 'alarmClockAlarms';
var SNOOZE_STORAGE_KEY = 'alarmClockSnoozes';
var ALARM_SCHEMA_VERSION = 1;
var MAX_LABEL_LENGTH = 50;

/** Day-of-week indices used in repeatDays (Sunday = 0 … Saturday = 6). */
var VALID_DAY_RANGE = [0, 1, 2, 3, 4, 5, 6];

/* ------------------------------------------------------------------ */
/*  ID generation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Generate a unique alarm ID.
 * Uses timestamp + random hex — not cryptographic but sufficient for
 * local-only alarm identification.
 * @returns {string}
 */
function generateId() {
  var ts = Date.now().toString(36);
  var rand = Math.random().toString(36).slice(2, 10);
  return ts + '-' + rand;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Validate raw alarm data.
 * Returns an object with `valid` (boolean) and `errors` (string[]).
 *
 * Rules:
 *  - hour: required integer 0–23
 *  - minute: required integer 0–59
 *  - label: optional string, max 50 chars
 *  - enabled: optional boolean
 *  - repeatDays: optional array of integers 0–6, no duplicates
 *
 * @param {object} raw - Alarm data to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateAlarm(raw) {
  var errors = [];

  if (raw === null || typeof raw !== 'object') {
    return { valid: false, errors: ['Alarm data must be an object'] };
  }

  // hour — required, integer 0–23
  if (
    typeof raw.hour !== 'number' ||
    !Number.isInteger(raw.hour) ||
    raw.hour < 0 ||
    raw.hour > 23
  ) {
    errors.push('hour must be an integer between 0 and 23');
  }

  // minute — required, integer 0–59
  if (
    typeof raw.minute !== 'number' ||
    !Number.isInteger(raw.minute) ||
    raw.minute < 0 ||
    raw.minute > 59
  ) {
    errors.push('minute must be an integer between 0 and 59');
  }

  // label — optional string, max length
  if (raw.label !== undefined && raw.label !== null) {
    if (typeof raw.label !== 'string') {
      errors.push('label must be a string');
    } else if (raw.label.length > MAX_LABEL_LENGTH) {
      errors.push('label must be at most ' + MAX_LABEL_LENGTH + ' characters');
    }
  }

  // enabled — optional boolean
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  // repeatDays — optional array of day indices
  if (raw.repeatDays !== undefined && raw.repeatDays !== null) {
    if (!Array.isArray(raw.repeatDays)) {
      errors.push('repeatDays must be an array');
    } else {
      var seen = {};
      for (var i = 0; i < raw.repeatDays.length; i++) {
        var d = raw.repeatDays[i];
        if (typeof d !== 'number' || !Number.isInteger(d) || VALID_DAY_RANGE.indexOf(d) === -1) {
          errors.push('repeatDays values must be integers 0–6 (Sunday=0)');
          break;
        }
        if (seen[d]) {
          errors.push('repeatDays must not contain duplicates');
          break;
        }
        seen[d] = true;
      }
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

/* ------------------------------------------------------------------ */
/*  Sanitization                                                       */
/* ------------------------------------------------------------------ */

/**
 * Sanitize raw alarm data into a safe alarm object.
 * Coerces fields to valid ranges and fills defaults where needed.
 * Does NOT generate an id or timestamps — callers handle those.
 *
 * @param {object} raw - Potentially untrusted alarm data
 * @returns {object} Sanitized alarm fields (without id/timestamps)
 */
function sanitizeAlarm(raw) {
  if (raw === null || typeof raw !== 'object') {
    raw = {};
  }

  var hour =
    typeof raw.hour === 'number' && Number.isInteger(raw.hour)
      ? Math.max(0, Math.min(23, raw.hour))
      : 0;

  var minute =
    typeof raw.minute === 'number' && Number.isInteger(raw.minute)
      ? Math.max(0, Math.min(59, raw.minute))
      : 0;

  var label = '';
  if (typeof raw.label === 'string') {
    label = raw.label.trim().slice(0, MAX_LABEL_LENGTH);
  }

  var enabled = typeof raw.enabled === 'boolean' ? raw.enabled : true;

  var repeatDays = [];
  if (Array.isArray(raw.repeatDays)) {
    var seen = {};
    for (var i = 0; i < raw.repeatDays.length; i++) {
      var d = raw.repeatDays[i];
      if (typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6 && !seen[d]) {
        repeatDays.push(d);
        seen[d] = true;
      }
    }
    repeatDays.sort(function (a, b) {
      return a - b;
    });
  }

  return {
    hour: hour,
    minute: minute,
    label: label,
    enabled: enabled,
    repeatDays: repeatDays,
  };
}

/* ------------------------------------------------------------------ */
/*  Next-fire computation                                              */
/* ------------------------------------------------------------------ */

/**
 * Compute the next fire time for an alarm relative to `now`.
 *
 * One-time alarm (repeatDays empty):
 *   Next occurrence of HH:MM — today if still in the future, else tomorrow.
 *
 * Repeating alarm (repeatDays non-empty):
 *   Next matching day-of-week at HH:MM. Scans up to 7 days forward.
 *
 * Returns null if the alarm is disabled.
 *
 * @param {object} alarm - Alarm object with hour, minute, enabled, repeatDays
 * @param {Date} [now] - Reference time (defaults to new Date())
 * @returns {string|null} ISO 8601 string or null
 */
function computeNextFireAt(alarm, now) {
  if (!alarm.enabled) {
    return null;
  }

  if (!now) {
    now = new Date();
  }

  var hour = alarm.hour;
  var minute = alarm.minute;

  if (alarm.repeatDays && alarm.repeatDays.length > 0) {
    // Repeating alarm — find the next matching weekday
    for (var offset = 0; offset < 7; offset++) {
      var candidate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + offset,
        hour,
        minute,
        0,
        0
      );
      var dayOfWeek = candidate.getDay();

      if (alarm.repeatDays.indexOf(dayOfWeek) === -1) {
        continue;
      }

      // If today at the alarm time, only valid if still in the future
      if (offset === 0 && candidate.getTime() <= now.getTime()) {
        continue;
      }

      return candidate.toISOString();
    }

    // Wrap around: all matching days are earlier in the week, so go to next week
    for (var offset2 = 0; offset2 < 7; offset2++) {
      var candidate2 = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 7 + offset2,
        hour,
        minute,
        0,
        0
      );
      var dayOfWeek2 = candidate2.getDay();

      if (alarm.repeatDays.indexOf(dayOfWeek2) !== -1) {
        return candidate2.toISOString();
      }
    }

    return null;
  }

  // One-time alarm — today if in the future, else tomorrow
  var todayAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);

  if (todayAt.getTime() > now.getTime()) {
    return todayAt.toISOString();
  }

  var tomorrowAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    hour,
    minute,
    0,
    0
  );
  return tomorrowAt.toISOString();
}

/* ------------------------------------------------------------------ */
/*  Schema migration                                                   */
/* ------------------------------------------------------------------ */

/**
 * Migrate stored alarm data to the current schema version.
 * Currently only version 1 exists; this function provides the hook
 * for future migrations.
 *
 * @param {object} stored - Raw data from chrome.storage.local
 * @returns {{ schemaVersion: number, alarms: object[] }}
 */
function migrateAlarms(stored) {
  if (!stored || typeof stored !== 'object') {
    return { schemaVersion: ALARM_SCHEMA_VERSION, alarms: [] };
  }

  var version = stored.schemaVersion;

  // Unknown or missing version — treat as fresh
  if (typeof version !== 'number' || version < 1) {
    return { schemaVersion: ALARM_SCHEMA_VERSION, alarms: [] };
  }

  // Future version from a newer extension — preserve data as-is (best effort)
  if (version > ALARM_SCHEMA_VERSION) {
    console.warn(
      'Alarm storage schema version ' +
        version +
        ' is newer than supported (' +
        ALARM_SCHEMA_VERSION +
        '). Using data as-is.'
    );
    return {
      schemaVersion: version,
      alarms: Array.isArray(stored.alarms) ? stored.alarms : [],
    };
  }

  // Version 1 (current) — no migration needed
  return {
    schemaVersion: ALARM_SCHEMA_VERSION,
    alarms: Array.isArray(stored.alarms) ? stored.alarms : [],
  };
}

/**
 * Migrate stored snooze data to the current schema version.
 *
 * @param {object} stored - Raw data from chrome.storage.local
 * @returns {{ schemaVersion: number, snoozes: object[] }}
 */
function migrateSnoozes(stored) {
  if (!stored || typeof stored !== 'object') {
    return { schemaVersion: ALARM_SCHEMA_VERSION, snoozes: [] };
  }

  var version = stored.schemaVersion;

  if (typeof version !== 'number' || version < 1) {
    return { schemaVersion: ALARM_SCHEMA_VERSION, snoozes: [] };
  }

  if (version > ALARM_SCHEMA_VERSION) {
    console.warn(
      'Snooze storage schema version ' +
        version +
        ' is newer than supported (' +
        ALARM_SCHEMA_VERSION +
        '). Using data as-is.'
    );
  }

  return {
    schemaVersion: version > ALARM_SCHEMA_VERSION ? version : ALARM_SCHEMA_VERSION,
    snoozes: Array.isArray(stored.snoozes) ? stored.snoozes : [],
  };
}

/* ------------------------------------------------------------------ */
/*  Chrome storage helpers                                             */
/* ------------------------------------------------------------------ */

/** @returns {boolean} Whether chrome.storage.local is available. */
function _hasStorage() {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
}

/**
 * Read a key from chrome.storage.local.
 * @param {string} key
 * @returns {Promise<*>} Resolves with the stored value or undefined
 */
function _storageGet(key) {
  if (!_hasStorage()) {
    return Promise.resolve(undefined);
  }
  return new Promise(function (resolve) {
    chrome.storage.local.get(key, function (result) {
      resolve(result && result[key]);
    });
  });
}

/**
 * Write a key/value pair to chrome.storage.local.
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
function _storageSet(key, value) {
  if (!_hasStorage()) {
    return Promise.resolve();
  }
  var data = {};
  data[key] = value;
  return new Promise(function (resolve) {
    chrome.storage.local.set(data, function () {
      resolve();
    });
  });
}

/* ------------------------------------------------------------------ */
/*  CRUD — Alarms                                                      */
/* ------------------------------------------------------------------ */

/**
 * Load all alarms from storage.
 * Applies schema migration and sanitisation to each alarm.
 *
 * @returns {Promise<object[]>} Array of sanitized alarm objects
 */
function loadAlarms() {
  return _storageGet(ALARM_STORAGE_KEY).then(function (raw) {
    var migrated = migrateAlarms(raw);
    return migrated.alarms.map(function (a) {
      var safe = sanitizeAlarm(a);
      // Preserve stored identity and metadata
      safe.id = typeof a.id === 'string' && a.id ? a.id : generateId();
      safe.createdAt = typeof a.createdAt === 'string' ? a.createdAt : new Date().toISOString();
      safe.updatedAt = typeof a.updatedAt === 'string' ? a.updatedAt : safe.createdAt;
      safe.nextFireAt = typeof a.nextFireAt === 'string' ? a.nextFireAt : computeNextFireAt(safe);
      return safe;
    });
  });
}

/**
 * Save an array of alarms to storage (replaces all).
 *
 * @param {object[]} alarms
 * @returns {Promise<void>}
 */
function saveAlarms(alarms) {
  return _storageSet(ALARM_STORAGE_KEY, {
    schemaVersion: ALARM_SCHEMA_VERSION,
    alarms: alarms,
  });
}

/**
 * Get a single alarm by ID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
function getAlarm(id) {
  return loadAlarms().then(function (alarms) {
    for (var i = 0; i < alarms.length; i++) {
      if (alarms[i].id === id) {
        return alarms[i];
      }
    }
    return null;
  });
}

/**
 * Create a new alarm.
 * Validates input; rejects with an error message if invalid.
 *
 * @param {object} data - Alarm fields (hour, minute, label, repeatDays, enabled)
 * @param {Date} [now] - Reference time for nextFireAt (testing)
 * @returns {Promise<object>} The created alarm
 */
function createAlarm(data, now) {
  var validation = validateAlarm(data);
  if (!validation.valid) {
    return Promise.reject(new Error(validation.errors.join('; ')));
  }

  var safe = sanitizeAlarm(data);
  var timestamp = (now || new Date()).toISOString();

  safe.id = generateId();
  safe.createdAt = timestamp;
  safe.updatedAt = timestamp;
  safe.nextFireAt = computeNextFireAt(safe, now);

  return loadAlarms().then(function (alarms) {
    alarms.push(safe);
    return saveAlarms(alarms).then(function () {
      return safe;
    });
  });
}

/**
 * Update an existing alarm by ID.
 * Validates the merged data; rejects if invalid or ID not found.
 *
 * @param {string} id
 * @param {object} data - Fields to update
 * @param {Date} [now] - Reference time for nextFireAt (testing)
 * @returns {Promise<object>} The updated alarm
 */
function updateAlarm(id, data, now) {
  return loadAlarms().then(function (alarms) {
    var index = -1;
    for (var i = 0; i < alarms.length; i++) {
      if (alarms[i].id === id) {
        index = i;
        break;
      }
    }

    if (index === -1) {
      return Promise.reject(new Error('Alarm not found: ' + id));
    }

    // Merge incoming data onto existing alarm
    var existing = alarms[index];
    var merged = {
      hour: data.hour !== undefined ? data.hour : existing.hour,
      minute: data.minute !== undefined ? data.minute : existing.minute,
      label: data.label !== undefined ? data.label : existing.label,
      enabled: data.enabled !== undefined ? data.enabled : existing.enabled,
      repeatDays: data.repeatDays !== undefined ? data.repeatDays : existing.repeatDays,
    };

    var validation = validateAlarm(merged);
    if (!validation.valid) {
      return Promise.reject(new Error(validation.errors.join('; ')));
    }

    var safe = sanitizeAlarm(merged);
    safe.id = id;
    safe.createdAt = existing.createdAt;
    safe.updatedAt = (now || new Date()).toISOString();
    safe.nextFireAt = computeNextFireAt(safe, now);

    alarms[index] = safe;

    return saveAlarms(alarms).then(function () {
      return safe;
    });
  });
}

/**
 * Delete an alarm by ID.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
function deleteAlarm(id) {
  return loadAlarms().then(function (alarms) {
    var filtered = alarms.filter(function (a) {
      return a.id !== id;
    });
    return saveAlarms(filtered);
  });
}

/* ------------------------------------------------------------------ */
/*  CRUD — Snoozes                                                     */
/* ------------------------------------------------------------------ */

/**
 * Load all snoozes from storage.
 *
 * @returns {Promise<object[]>}
 */
function loadSnoozes() {
  return _storageGet(SNOOZE_STORAGE_KEY).then(function (raw) {
    var migrated = migrateSnoozes(raw);
    return migrated.snoozes.map(function (s) {
      return {
        alarmId: typeof s.alarmId === 'string' ? s.alarmId : '',
        snoozeUntil: typeof s.snoozeUntil === 'string' ? s.snoozeUntil : '',
        notificationId: typeof s.notificationId === 'string' ? s.notificationId : null,
      };
    });
  });
}

/**
 * Save snoozes to storage (replaces all).
 *
 * @param {object[]} snoozes
 * @returns {Promise<void>}
 */
function saveSnoozes(snoozes) {
  return _storageSet(SNOOZE_STORAGE_KEY, {
    schemaVersion: ALARM_SCHEMA_VERSION,
    snoozes: snoozes,
  });
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && module.exports) {
  // eslint-disable-next-line no-undef
  module.exports = {
    ALARM_STORAGE_KEY: ALARM_STORAGE_KEY,
    SNOOZE_STORAGE_KEY: SNOOZE_STORAGE_KEY,
    ALARM_SCHEMA_VERSION: ALARM_SCHEMA_VERSION,
    MAX_LABEL_LENGTH: MAX_LABEL_LENGTH,
    generateId: generateId,
    validateAlarm: validateAlarm,
    sanitizeAlarm: sanitizeAlarm,
    computeNextFireAt: computeNextFireAt,
    migrateAlarms: migrateAlarms,
    migrateSnoozes: migrateSnoozes,
    loadAlarms: loadAlarms,
    saveAlarms: saveAlarms,
    getAlarm: getAlarm,
    createAlarm: createAlarm,
    updateAlarm: updateAlarm,
    deleteAlarm: deleteAlarm,
    loadSnoozes: loadSnoozes,
    saveSnoozes: saveSnoozes,
  };
}
