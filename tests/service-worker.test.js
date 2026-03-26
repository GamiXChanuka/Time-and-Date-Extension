/**
 * Tests for the background service worker scheduling and recovery logic.
 *
 * Mocks chrome.alarms, chrome.notifications, chrome.runtime, chrome.storage,
 * and the importScripts/self.AlarmStorage globals so the service worker module
 * can be loaded in a Node/Jest environment.
 */

/* ------------------------------------------------------------------ */
/*  Global mocks — must be set BEFORE requiring the module             */
/* ------------------------------------------------------------------ */

var mockAlarmStore = {}; // keyed by alarm name
var mockNotifications = {}; // keyed by notification id
var mockStorageData = {}; // chrome.storage.local backing store
var capturedListeners = {};

/** Captures listeners registered via chrome.*.addListener. */
function captureListener(eventName) {
  return {
    addListener: function (fn) {
      capturedListeners[eventName] = fn;
    },
  };
}

// Set up global.self for AlarmStorage to attach to
global.self = global;

// Load the real alarm-storage module so AlarmStorage is available
require('../src/alarm-storage.js');

// Set up chrome globals BEFORE loading service worker
global.importScripts = function () {
  /* alarm-storage already loaded above */
};

global.chrome = {
  alarms: {
    create: function (name, opts, cb) {
      mockAlarmStore[name] = opts;
      if (cb) {
        cb();
      }
    },
    clear: function (name, cb) {
      delete mockAlarmStore[name];
      if (cb) {
        cb(true);
      }
    },
    clearAll: function (cb) {
      mockAlarmStore = {};
      if (cb) {
        cb();
      }
    },
    onAlarm: captureListener('onAlarm'),
  },
  notifications: {
    create: function (id, opts, cb) {
      mockNotifications[id] = opts;
      if (cb) {
        cb(id);
      }
    },
    clear: function (id, cb) {
      delete mockNotifications[id];
      if (cb) {
        cb(true);
      }
    },
    onButtonClicked: captureListener('onButtonClicked'),
    onClosed: captureListener('onClosed'),
  },
  runtime: {
    onInstalled: captureListener('onInstalled'),
    onStartup: captureListener('onStartup'),
  },
  storage: {
    local: {
      get: function (key, cb) {
        var result = {};
        result[key] = mockStorageData[key];
        cb(result);
      },
      set: function (data, cb) {
        Object.keys(data).forEach(function (k) {
          mockStorageData[k] = data[k];
        });
        cb();
      },
    },
  },
};

// Now require the service worker module
var sw = require('../src/background/service-worker.js');
var alarmStorage = require('../src/alarm-storage.js');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resetMocks() {
  mockAlarmStore = {};
  mockNotifications = {};
  mockStorageData = {};
}

/** Saves alarms directly into mock storage. */
function seedAlarms(alarms) {
  mockStorageData[alarmStorage.ALARM_STORAGE_KEY] = {
    schemaVersion: 1,
    alarms: alarms,
  };
}

/** Saves snoozes directly into mock storage. */
function seedSnoozes(snoozes) {
  mockStorageData[alarmStorage.SNOOZE_STORAGE_KEY] = {
    schemaVersion: 1,
    snoozes: snoozes,
  };
}

/** Reads alarms from mock storage. */
function readStoredAlarms() {
  var raw = mockStorageData[alarmStorage.ALARM_STORAGE_KEY];
  return raw && raw.alarms ? raw.alarms : [];
}

/** Reads snoozes from mock storage. */
function readStoredSnoozes() {
  var raw = mockStorageData[alarmStorage.SNOOZE_STORAGE_KEY];
  return raw && raw.snoozes ? raw.snoozes : [];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

describe('service worker constants', function () {
  it('exports ALARM_PREFIX', function () {
    expect(sw.ALARM_PREFIX).toBe('alarm-');
  });

  it('exports SNOOZE_PREFIX', function () {
    expect(sw.SNOOZE_PREFIX).toBe('snooze-');
  });

  it('exports MISSED_THRESHOLD_MS as 15 minutes', function () {
    expect(sw.MISSED_THRESHOLD_MS).toBe(15 * 60 * 1000);
  });

  it('exports SNOOZE_MINUTES as 5', function () {
    expect(sw.SNOOZE_MINUTES).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/*  scheduleAlarm                                                      */
/* ------------------------------------------------------------------ */

describe('scheduleAlarm', function () {
  beforeEach(resetMocks);

  it('creates a chrome.alarms entry for an enabled alarm with future nextFireAt', function () {
    var futureTime = new Date(Date.now() + 60000).toISOString();
    var alarm = { id: 'test-1', enabled: true, nextFireAt: futureTime };

    return sw.scheduleAlarm(alarm).then(function () {
      expect(mockAlarmStore['alarm-test-1']).toBeDefined();
      expect(mockAlarmStore['alarm-test-1'].when).toBe(new Date(futureTime).getTime());
    });
  });

  it('does not create entry for disabled alarm', function () {
    var alarm = {
      id: 'test-2',
      enabled: false,
      nextFireAt: new Date(Date.now() + 60000).toISOString(),
    };

    return sw.scheduleAlarm(alarm).then(function () {
      expect(mockAlarmStore['alarm-test-2']).toBeUndefined();
    });
  });

  it('does not create entry when nextFireAt is null', function () {
    var alarm = { id: 'test-3', enabled: true, nextFireAt: null };

    return sw.scheduleAlarm(alarm).then(function () {
      expect(mockAlarmStore['alarm-test-3']).toBeUndefined();
    });
  });

  it('does not create entry when nextFireAt is in the past', function () {
    var pastTime = new Date(Date.now() - 60000).toISOString();
    var alarm = { id: 'test-4', enabled: true, nextFireAt: pastTime };

    return sw.scheduleAlarm(alarm).then(function () {
      expect(mockAlarmStore['alarm-test-4']).toBeUndefined();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  clearAlarm                                                         */
/* ------------------------------------------------------------------ */

describe('clearAlarm', function () {
  beforeEach(resetMocks);

  it('clears both regular and snooze chrome.alarms entries', function () {
    mockAlarmStore['alarm-abc'] = { when: 12345 };
    mockAlarmStore['snooze-abc'] = { delayInMinutes: 5 };

    return sw.clearAlarm('abc').then(function () {
      expect(mockAlarmStore['alarm-abc']).toBeUndefined();
      expect(mockAlarmStore['snooze-abc']).toBeUndefined();
    });
  });

  it('succeeds even if entries do not exist', function () {
    return sw.clearAlarm('nonexistent').then(function () {
      expect(Object.keys(mockAlarmStore)).toHaveLength(0);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  scheduleSnooze                                                     */
/* ------------------------------------------------------------------ */

describe('scheduleSnooze', function () {
  beforeEach(resetMocks);

  it('creates a snooze chrome.alarms entry with 5 minute delay', function () {
    return sw.scheduleSnooze('abc').then(function () {
      expect(mockAlarmStore['snooze-abc']).toBeDefined();
      expect(mockAlarmStore['snooze-abc'].delayInMinutes).toBe(5);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  rehydrateAlarms                                                    */
/* ------------------------------------------------------------------ */

describe('rehydrateAlarms', function () {
  beforeEach(resetMocks);

  it('clears all chrome.alarms and reschedules enabled alarms', function () {
    // Pre-populate an orphan chrome alarm
    mockAlarmStore['orphan'] = { when: 99999 };

    // Seed an enabled alarm with a future fire time
    var futureHour = new Date().getHours() + 2;
    if (futureHour > 23) {
      futureHour = futureHour - 24;
    }
    seedAlarms([
      {
        id: 'a1',
        hour: futureHour,
        minute: 0,
        label: 'Test',
        enabled: true,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: new Date(Date.now() + 3600000).toISOString(),
      },
    ]);

    return sw.rehydrateAlarms().then(function () {
      // Orphan should be cleared
      expect(mockAlarmStore['orphan']).toBeUndefined();
      // Alarm should be rescheduled
      expect(mockAlarmStore['alarm-a1']).toBeDefined();
    });
  });

  it('does not schedule disabled alarms', function () {
    seedAlarms([
      {
        id: 'disabled1',
        hour: 8,
        minute: 0,
        label: '',
        enabled: false,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: null,
      },
    ]);

    return sw.rehydrateAlarms().then(function () {
      expect(mockAlarmStore['alarm-disabled1']).toBeUndefined();
    });
  });

  it('fires notifications for alarms missed by <= 15 minutes', function () {
    var missedTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago

    seedAlarms([
      {
        id: 'missed1',
        hour: new Date(Date.now() - 5 * 60 * 1000).getHours(),
        minute: new Date(Date.now() - 5 * 60 * 1000).getMinutes(),
        label: 'Missed alarm',
        enabled: true,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: missedTime,
      },
    ]);

    return sw.rehydrateAlarms().then(function () {
      // Should have created a notification for the missed alarm
      expect(mockNotifications['alarm-missed1']).toBeDefined();
      expect(mockNotifications['alarm-missed1'].title).toBe('Missed alarm');
    });
  });

  it('does NOT fire notifications for alarms missed by > 15 minutes', function () {
    var longMissedTime = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago

    seedAlarms([
      {
        id: 'old1',
        hour: 3,
        minute: 0,
        label: 'Old alarm',
        enabled: true,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: longMissedTime,
      },
    ]);

    return sw.rehydrateAlarms().then(function () {
      expect(mockNotifications['alarm-old1']).toBeUndefined();
    });
  });

  it('updates nextFireAt in storage after rehydration', function () {
    var futureHour = new Date().getHours() + 3;
    if (futureHour > 23) {
      futureHour = futureHour - 24;
    }
    seedAlarms([
      {
        id: 'upd1',
        hour: futureHour,
        minute: 30,
        label: '',
        enabled: true,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: '2025-01-01T00:00:00Z', // stale
      },
    ]);

    return sw.rehydrateAlarms().then(function () {
      var stored = readStoredAlarms();
      expect(stored.length).toBe(1);
      // nextFireAt should be updated (not the stale value)
      expect(stored[0].nextFireAt).not.toBe('2025-01-01T00:00:00Z');
    });
  });

  it('handles empty storage gracefully', function () {
    return sw.rehydrateAlarms().then(function () {
      expect(Object.keys(mockAlarmStore)).toHaveLength(0);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  onAlarmFired                                                       */
/* ------------------------------------------------------------------ */

describe('onAlarmFired', function () {
  beforeEach(resetMocks);

  it('fires a notification when a regular alarm triggers', function () {
    seedAlarms([
      {
        id: 'fire1',
        hour: 8,
        minute: 30,
        label: 'Wake up',
        enabled: true,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: new Date().toISOString(),
      },
    ]);

    return sw.onAlarmFired({ name: 'alarm-fire1' }).then(function () {
      expect(mockNotifications['alarm-fire1']).toBeDefined();
      expect(mockNotifications['alarm-fire1'].title).toBe('Wake up');
      expect(mockNotifications['alarm-fire1'].buttons).toHaveLength(2);
    });
  });

  it('marks one-time alarms as disabled after firing', function () {
    seedAlarms([
      {
        id: 'onetime1',
        hour: 8,
        minute: 0,
        label: '',
        enabled: true,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: new Date().toISOString(),
      },
    ]);

    return sw.onAlarmFired({ name: 'alarm-onetime1' }).then(function () {
      var stored = readStoredAlarms();
      expect(stored[0].enabled).toBe(false);
      expect(stored[0].nextFireAt).toBeNull();
    });
  });

  it('advances repeating alarms to next occurrence after firing', function () {
    var now = new Date();
    seedAlarms([
      {
        id: 'repeat1',
        hour: now.getHours(),
        minute: now.getMinutes(),
        label: 'Daily',
        enabled: true,
        repeatDays: [0, 1, 2, 3, 4, 5, 6], // every day
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: now.toISOString(),
      },
    ]);

    return sw.onAlarmFired({ name: 'alarm-repeat1' }).then(function () {
      var stored = readStoredAlarms();
      expect(stored[0].enabled).toBe(true);
      expect(stored[0].nextFireAt).not.toBeNull();
      // Next fire should be in the future (tomorrow at same time)
      var nextMs = new Date(stored[0].nextFireAt).getTime();
      expect(nextMs).toBeGreaterThan(now.getTime());
    });
  });

  it('fires notification for snooze alarm and cleans up snooze record', function () {
    seedAlarms([
      {
        id: 'snz1',
        hour: 8,
        minute: 0,
        label: 'Snoozed one',
        enabled: true,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: new Date().toISOString(),
      },
    ]);
    seedSnoozes([
      {
        alarmId: 'snz1',
        snoozeUntil: new Date().toISOString(),
        notificationId: 'alarm-snz1',
      },
    ]);

    return sw.onAlarmFired({ name: 'snooze-snz1' }).then(function () {
      // Notification should be shown
      expect(mockNotifications['alarm-snz1']).toBeDefined();

      // Snooze record should be removed
      var snoozeData = mockStorageData[alarmStorage.SNOOZE_STORAGE_KEY];
      expect(snoozeData.snoozes).toHaveLength(0);
    });
  });

  it('handles missing alarm gracefully', function () {
    seedAlarms([]);

    // Should not throw
    return sw.onAlarmFired({ name: 'alarm-nonexistent' });
  });

  it('uses default title when label is empty', function () {
    seedAlarms([
      {
        id: 'nolabel',
        hour: 12,
        minute: 0,
        label: '',
        enabled: true,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: new Date().toISOString(),
      },
    ]);

    return sw.onAlarmFired({ name: 'alarm-nolabel' }).then(function () {
      expect(mockNotifications['alarm-nolabel'].title).toBe('Alarm');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Notification button actions                                        */
/* ------------------------------------------------------------------ */

describe('onNotificationButtonClicked', function () {
  beforeEach(resetMocks);

  it('schedules a snooze on button index 0', function () {
    seedAlarms([
      {
        id: 'btn1',
        hour: 8,
        minute: 0,
        label: '',
        enabled: true,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: new Date().toISOString(),
      },
    ]);

    // Simulate button 0 (Snooze) click
    sw.onNotificationButtonClicked('alarm-btn1', 0);

    // Give promises time to resolve
    return new Promise(function (resolve) {
      setTimeout(resolve, 50);
    }).then(function () {
      expect(mockAlarmStore['snooze-btn1']).toBeDefined();
      expect(mockAlarmStore['snooze-btn1'].delayInMinutes).toBe(5);
    });
  });

  it('cleans up snooze on button index 1 (dismiss)', function () {
    seedSnoozes([
      {
        alarmId: 'btn2',
        snoozeUntil: new Date().toISOString(),
        notificationId: 'alarm-btn2',
      },
    ]);
    mockAlarmStore['snooze-btn2'] = { delayInMinutes: 5 };

    sw.onNotificationButtonClicked('alarm-btn2', 1);

    return new Promise(function (resolve) {
      setTimeout(resolve, 50);
    }).then(function () {
      expect(mockAlarmStore['snooze-btn2']).toBeUndefined();
      var snoozeData = mockStorageData[alarmStorage.SNOOZE_STORAGE_KEY];
      expect(snoozeData.snoozes).toHaveLength(0);
    });
  });

  it('ignores notifications not matching alarm prefix', function () {
    // Should not throw
    sw.onNotificationButtonClicked('some-other-notification', 0);
  });
});

/* ------------------------------------------------------------------ */
/*  Notification format and options                                     */
/* ------------------------------------------------------------------ */

describe('fireNotification', function () {
  beforeEach(resetMocks);

  it('shows notification with alarm label as title', function () {
    sw.fireNotification({ id: 'fmt1', hour: 9, minute: 5, label: 'Stand-up' });
    expect(mockNotifications['alarm-fmt1'].title).toBe('Stand-up');
  });

  it('falls back to "Alarm" when label is empty', function () {
    sw.fireNotification({ id: 'fmt2', hour: 14, minute: 0, label: '' });
    expect(mockNotifications['alarm-fmt2'].title).toBe('Alarm');
  });

  it('includes zero-padded time in the message', function () {
    sw.fireNotification({ id: 'fmt3', hour: 7, minute: 5, label: '' });
    expect(mockNotifications['alarm-fmt3'].message).toBe('Alarm at 07:05');
  });

  it('includes Snooze and Dismiss action buttons', function () {
    sw.fireNotification({ id: 'fmt4', hour: 8, minute: 0, label: '' });
    var opts = mockNotifications['alarm-fmt4'];
    expect(opts.buttons).toHaveLength(2);
    expect(opts.buttons[0].title).toMatch(/Snooze/);
    expect(opts.buttons[0].title).toMatch(/5/);
    expect(opts.buttons[1].title).toBe('Dismiss');
  });

  it('uses type basic with requireInteraction and priority 2', function () {
    sw.fireNotification({ id: 'fmt5', hour: 8, minute: 0, label: '' });
    var opts = mockNotifications['alarm-fmt5'];
    expect(opts.type).toBe('basic');
    expect(opts.requireInteraction).toBe(true);
    expect(opts.priority).toBe(2);
  });

  it('includes the extension icon', function () {
    sw.fireNotification({ id: 'fmt6', hour: 8, minute: 0, label: '' });
    expect(mockNotifications['alarm-fmt6'].iconUrl).toMatch(/icon128\.png$/);
  });
});

/* ------------------------------------------------------------------ */
/*  Snooze does not break repeating schedule                           */
/* ------------------------------------------------------------------ */

describe('snooze does not break repeating schedule', function () {
  beforeEach(resetMocks);

  it('repeating alarm stays scheduled after snooze fires', function () {
    var now = new Date();
    var nextFireAt = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      8,
      0,
      0,
      0
    ).toISOString();

    seedAlarms([
      {
        id: 'rep-snz',
        hour: 8,
        minute: 0,
        label: 'Daily standup',
        enabled: true,
        repeatDays: [0, 1, 2, 3, 4, 5, 6],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: nextFireAt,
      },
    ]);

    // Step 1: Regular alarm fires — schedule advances
    return sw
      .onAlarmFired({ name: 'alarm-rep-snz' })
      .then(function () {
        var stored = readStoredAlarms();
        // Alarm remains enabled with a future nextFireAt
        expect(stored[0].enabled).toBe(true);
        expect(stored[0].nextFireAt).not.toBeNull();
        var nextMs = new Date(stored[0].nextFireAt).getTime();
        expect(nextMs).toBeGreaterThan(now.getTime());

        // Step 2: User clicks Snooze
        sw.onNotificationButtonClicked('alarm-rep-snz', 0);

        return new Promise(function (resolve) {
          setTimeout(resolve, 50);
        });
      })
      .then(function () {
        // Snooze alarm should exist
        expect(mockAlarmStore['snooze-rep-snz']).toBeDefined();
        expect(mockAlarmStore['snooze-rep-snz'].delayInMinutes).toBe(5);

        // Snooze record persisted
        var snoozes = readStoredSnoozes();
        expect(snoozes.length).toBe(1);
        expect(snoozes[0].alarmId).toBe('rep-snz');

        // Original alarm still enabled and has nextFireAt
        var stored = readStoredAlarms();
        expect(stored[0].enabled).toBe(true);
        expect(stored[0].nextFireAt).not.toBeNull();

        // Step 3: Snooze fires
        return sw.onAlarmFired({ name: 'snooze-rep-snz' });
      })
      .then(function () {
        // Notification shown again
        expect(mockNotifications['alarm-rep-snz']).toBeDefined();

        // Snooze record cleaned up
        var snoozes = readStoredSnoozes();
        expect(snoozes.length).toBe(0);

        // Original alarm STILL enabled with future nextFireAt (schedule not broken)
        var stored = readStoredAlarms();
        expect(stored[0].enabled).toBe(true);
        expect(stored[0].nextFireAt).not.toBeNull();
      });
  });

  it('one-time alarm stays disabled after snooze fires', function () {
    seedAlarms([
      {
        id: 'ot-snz',
        hour: 15,
        minute: 30,
        label: 'Reminder',
        enabled: true,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: new Date().toISOString(),
      },
    ]);

    // Step 1: One-time alarm fires — marked disabled
    return sw
      .onAlarmFired({ name: 'alarm-ot-snz' })
      .then(function () {
        var stored = readStoredAlarms();
        expect(stored[0].enabled).toBe(false);
        expect(stored[0].nextFireAt).toBeNull();

        // Step 2: User snoozes
        sw.onNotificationButtonClicked('alarm-ot-snz', 0);
        return new Promise(function (resolve) {
          setTimeout(resolve, 50);
        });
      })
      .then(function () {
        expect(mockAlarmStore['snooze-ot-snz']).toBeDefined();

        // Step 3: Snooze fires
        return sw.onAlarmFired({ name: 'snooze-ot-snz' });
      })
      .then(function () {
        // Notification shown
        expect(mockNotifications['alarm-ot-snz']).toBeDefined();

        // Alarm is still disabled (one-time completed)
        var stored = readStoredAlarms();
        expect(stored[0].enabled).toBe(false);
      });
  });
});

/* ------------------------------------------------------------------ */
/*  Dismiss behavior                                                   */
/* ------------------------------------------------------------------ */

describe('dismiss behavior', function () {
  beforeEach(resetMocks);

  it('dismiss clears pending snooze alarm and record', function () {
    seedSnoozes([
      {
        alarmId: 'dism1',
        snoozeUntil: new Date(Date.now() + 300000).toISOString(),
        notificationId: 'alarm-dism1',
      },
    ]);
    mockAlarmStore['snooze-dism1'] = { delayInMinutes: 5 };

    sw.handleDismiss('dism1');

    return new Promise(function (resolve) {
      setTimeout(resolve, 50);
    }).then(function () {
      // Snooze chrome.alarm cleared
      expect(mockAlarmStore['snooze-dism1']).toBeUndefined();

      // Snooze record removed from storage
      var snoozes = readStoredSnoozes();
      expect(snoozes.length).toBe(0);
    });
  });

  it('dismiss is safe when no snooze exists', function () {
    // Should not throw
    sw.handleDismiss('no-snooze');

    return new Promise(function (resolve) {
      setTimeout(resolve, 50);
    }).then(function () {
      var snoozes = readStoredSnoozes();
      expect(snoozes.length).toBe(0);
    });
  });

  it('handleSnooze persists snooze record with correct fields', function () {
    sw.handleSnooze('snz-rec');

    return new Promise(function (resolve) {
      setTimeout(resolve, 50);
    }).then(function () {
      var snoozes = readStoredSnoozes();
      expect(snoozes.length).toBe(1);
      expect(snoozes[0].alarmId).toBe('snz-rec');
      expect(snoozes[0].snoozeUntil).toBeTruthy();
      expect(snoozes[0].notificationId).toBe('alarm-snz-rec');

      // Verify the snoozeUntil is ~5 minutes from now
      var snoozeMs = new Date(snoozes[0].snoozeUntil).getTime();
      var diff = snoozeMs - Date.now();
      expect(diff).toBeGreaterThan(4 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(5 * 60 * 1000 + 1000);
    });
  });

  it('handleSnooze replaces existing snooze for same alarm', function () {
    seedSnoozes([
      {
        alarmId: 'dup-snz',
        snoozeUntil: '2026-01-01T00:00:00Z',
        notificationId: 'alarm-dup-snz',
      },
    ]);

    sw.handleSnooze('dup-snz');

    return new Promise(function (resolve) {
      setTimeout(resolve, 50);
    }).then(function () {
      var snoozes = readStoredSnoozes();
      // Should have exactly one (replaced, not appended)
      expect(snoozes.length).toBe(1);
      expect(snoozes[0].alarmId).toBe('dup-snz');
      // snoozeUntil should be fresh (not the old 2026-01-01)
      expect(snoozes[0].snoozeUntil).not.toBe('2026-01-01T00:00:00Z');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Storage updates keep New Tab UI accurate                           */
/* ------------------------------------------------------------------ */

describe('storage updates for New Tab UI accuracy', function () {
  beforeEach(resetMocks);

  it('one-time alarm has updatedAt set after being marked completed', function () {
    var beforeFire = new Date().toISOString();
    seedAlarms([
      {
        id: 'ts1',
        hour: 8,
        minute: 0,
        label: '',
        enabled: true,
        repeatDays: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: new Date().toISOString(),
      },
    ]);

    return sw.onAlarmFired({ name: 'alarm-ts1' }).then(function () {
      var stored = readStoredAlarms();
      // updatedAt should be newer than the original
      expect(stored[0].updatedAt).not.toBe('2026-01-01T00:00:00Z');
      expect(stored[0].updatedAt >= beforeFire).toBe(true);
    });
  });

  it('repeating alarm nextFireAt is updated in storage after firing', function () {
    var now = new Date();
    var oldNextFire = now.toISOString();

    seedAlarms([
      {
        id: 'nf1',
        hour: now.getHours(),
        minute: now.getMinutes(),
        label: '',
        enabled: true,
        repeatDays: [0, 1, 2, 3, 4, 5, 6],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: oldNextFire,
      },
    ]);

    return sw.onAlarmFired({ name: 'alarm-nf1' }).then(function () {
      var stored = readStoredAlarms();
      // nextFireAt should have advanced beyond the old value
      expect(stored[0].nextFireAt).not.toBe(oldNextFire);
      var newMs = new Date(stored[0].nextFireAt).getTime();
      expect(newMs).toBeGreaterThan(now.getTime());
    });
  });

  it('repeating alarm re-schedules chrome.alarms entry after firing', function () {
    var now = new Date();
    seedAlarms([
      {
        id: 'sched1',
        hour: now.getHours(),
        minute: now.getMinutes(),
        label: '',
        enabled: true,
        repeatDays: [0, 1, 2, 3, 4, 5, 6],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nextFireAt: now.toISOString(),
      },
    ]);

    return sw.onAlarmFired({ name: 'alarm-sched1' }).then(function () {
      // A new chrome.alarms entry should be created for the next occurrence
      expect(mockAlarmStore['alarm-sched1']).toBeDefined();
      expect(mockAlarmStore['alarm-sched1'].when).toBeGreaterThan(now.getTime());
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Event listener registration                                        */
/* ------------------------------------------------------------------ */

describe('event listener registration', function () {
  it('registers onInstalled listener', function () {
    expect(typeof capturedListeners['onInstalled']).toBe('function');
  });

  it('registers onStartup listener', function () {
    expect(typeof capturedListeners['onStartup']).toBe('function');
  });

  it('registers onAlarm listener', function () {
    expect(typeof capturedListeners['onAlarm']).toBe('function');
  });

  it('registers onButtonClicked listener', function () {
    expect(typeof capturedListeners['onButtonClicked']).toBe('function');
  });

  it('registers onClosed listener', function () {
    expect(typeof capturedListeners['onClosed']).toBe('function');
  });
});
