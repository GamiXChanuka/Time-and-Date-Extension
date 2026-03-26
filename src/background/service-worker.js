/**
 * Background service worker for the Alarm Clock extension.
 *
 * Responsibilities:
 *  - Schedule/clear chrome.alarms entries when alarms are created/updated/deleted
 *  - Rehydrate enabled alarms from storage on startup (onInstalled, onStartup)
 *  - Apply the "missed by <= 15 minutes" fire-once rule on rehydration
 *  - Handle chrome.alarms.onAlarm events for regular and snooze alarms
 *  - Advance repeating alarms and mark one-time alarms as completed
 *
 * Uses importScripts to load the shared alarm-storage module.
 */

importScripts('../alarm-storage.js');

(function () {
  'use strict';

  var storage = self.AlarmStorage;

  /* ---------------------------------------------------------------- */
  /*  Constants                                                        */
  /* ---------------------------------------------------------------- */

  /** Prefix for regular chrome.alarms entries. */
  var ALARM_PREFIX = 'alarm-';

  /** Prefix for snooze chrome.alarms entries. */
  var SNOOZE_PREFIX = 'snooze-';

  /** Missed-alarm threshold: 15 minutes in milliseconds. */
  var MISSED_THRESHOLD_MS = 15 * 60 * 1000;

  /** Snooze duration in minutes. */
  var SNOOZE_MINUTES = 5;

  /* ---------------------------------------------------------------- */
  /*  chrome.alarms helpers                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Schedule a chrome.alarms entry for an alarm object.
   * No-op if the alarm is disabled or has no nextFireAt.
   *
   * @param {object} alarm - Alarm object with id, enabled, nextFireAt
   * @returns {Promise<void>}
   */
  function scheduleAlarm(alarm) {
    if (!alarm.enabled || !alarm.nextFireAt) {
      return Promise.resolve();
    }

    var when = new Date(alarm.nextFireAt).getTime();
    if (isNaN(when) || when <= Date.now()) {
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      chrome.alarms.create(ALARM_PREFIX + alarm.id, { when: when }, function () {
        resolve();
      });
    });
  }

  /**
   * Clear chrome.alarms entries for a given alarm ID.
   * Clears both the regular alarm and any pending snooze.
   *
   * @param {string} alarmId
   * @returns {Promise<void>}
   */
  function clearAlarm(alarmId) {
    return new Promise(function (resolve) {
      chrome.alarms.clear(ALARM_PREFIX + alarmId, function () {
        chrome.alarms.clear(SNOOZE_PREFIX + alarmId, function () {
          resolve();
        });
      });
    });
  }

  /**
   * Schedule a snooze chrome.alarms entry.
   *
   * @param {string} alarmId - The alarm being snoozed
   * @returns {Promise<void>}
   */
  function scheduleSnooze(alarmId) {
    return new Promise(function (resolve) {
      chrome.alarms.create(
        SNOOZE_PREFIX + alarmId,
        { delayInMinutes: SNOOZE_MINUTES },
        function () {
          resolve();
        }
      );
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Rehydration and missed-alarm recovery                            */
  /* ---------------------------------------------------------------- */

  /**
   * Rehydrate all enabled alarms from storage on startup.
   *
   * 1. Clear all existing chrome.alarms (clean slate, no orphans)
   * 2. Load alarms from storage
   * 3. For each enabled alarm:
   *    - Recompute nextFireAt
   *    - If the alarm was missed by <= 15 min, mark it for firing
   *    - Schedule the next occurrence
   * 4. Save updated alarms back to storage
   *
   * @returns {Promise<void>}
   */
  function rehydrateAlarms() {
    return new Promise(function (resolve) {
      chrome.alarms.clearAll(function () {
        resolve();
      });
    })
      .then(function () {
        return storage.loadAlarms();
      })
      .then(function (alarms) {
        var now = new Date();
        var nowMs = now.getTime();
        var missedAlarms = [];
        var schedulePromises = [];

        for (var i = 0; i < alarms.length; i++) {
          var alarm = alarms[i];

          if (!alarm.enabled) {
            continue;
          }

          // Recompute nextFireAt from the current time
          var previousNextFire = alarm.nextFireAt;
          var freshNextFire = storage.computeNextFireAt(alarm, now);

          // Check if the stored nextFireAt was missed (in the past but within threshold)
          if (previousNextFire) {
            var previousMs = new Date(previousNextFire).getTime();
            if (previousMs <= nowMs && nowMs - previousMs <= MISSED_THRESHOLD_MS) {
              missedAlarms.push(alarm);
            }
          }

          // Update the alarm's nextFireAt
          alarm.nextFireAt = freshNextFire;

          // Schedule the chrome.alarms entry
          if (freshNextFire) {
            schedulePromises.push(scheduleAlarm(alarm));
          }
        }

        return Promise.all(schedulePromises).then(function () {
          return storage.saveAlarms(alarms).then(function () {
            return missedAlarms;
          });
        });
      })
      .then(function (missedAlarms) {
        // Fire missed-alarm notifications (one per alarm)
        for (var i = 0; i < missedAlarms.length; i++) {
          fireNotification(missedAlarms[i]);
        }
      });
  }

  /* ---------------------------------------------------------------- */
  /*  Alarm firing                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Build and show a notification for a fired alarm.
   * Notification includes Snooze and Dismiss action buttons.
   *
   * @param {object} alarm - The alarm that fired
   */
  function fireNotification(alarm) {
    var title = alarm.label || 'Alarm';
    var message =
      'Alarm at ' +
      String(alarm.hour).padStart(2, '0') +
      ':' +
      String(alarm.minute).padStart(2, '0');

    chrome.notifications.create(
      ALARM_PREFIX + alarm.id,
      {
        type: 'basic',
        iconUrl: '../../assets/icons/icon128.png',
        title: title,
        message: message,
        buttons: [{ title: 'Snooze (' + SNOOZE_MINUTES + ' min)' }, { title: 'Dismiss' }],
        requireInteraction: true,
        priority: 2,
      },
      function () {
        /* notification created */
      }
    );
  }

  /**
   * Handle a chrome.alarms.onAlarm event.
   *
   * Parses the alarm name to determine if it's a regular alarm or snooze,
   * then fires the notification and advances the schedule.
   *
   * @param {object} chromeAlarm - The chrome.alarms.Alarm object
   */
  function onAlarmFired(chromeAlarm) {
    var name = chromeAlarm.name;
    var isSnooze = name.indexOf(SNOOZE_PREFIX) === 0;
    var alarmId = isSnooze ? name.slice(SNOOZE_PREFIX.length) : name.slice(ALARM_PREFIX.length);

    return storage
      .loadAlarms()
      .then(function (alarms) {
        var alarm = null;
        var index = -1;
        for (var i = 0; i < alarms.length; i++) {
          if (alarms[i].id === alarmId) {
            alarm = alarms[i];
            index = i;
            break;
          }
        }

        if (!alarm) {
          return;
        }

        // Fire the notification
        fireNotification(alarm);

        if (isSnooze) {
          // Snooze fired — remove the snooze record, keep alarm schedule intact
          return storage.loadSnoozes().then(function (snoozes) {
            var filtered = snoozes.filter(function (s) {
              return s.alarmId !== alarmId;
            });
            return storage.saveSnoozes(filtered);
          });
        }

        // Regular alarm fired — advance the schedule
        var now = new Date();

        if (alarm.repeatDays && alarm.repeatDays.length > 0) {
          // Repeating: compute and schedule next occurrence
          alarm.nextFireAt = storage.computeNextFireAt(alarm, now);
          alarms[index] = alarm;
          return storage.saveAlarms(alarms).then(function () {
            return scheduleAlarm(alarm);
          });
        }

        // One-time: mark as completed and disabled
        alarm.enabled = false;
        alarm.nextFireAt = null;
        alarm.updatedAt = now.toISOString();
        alarms[index] = alarm;
        return storage.saveAlarms(alarms);
      })
      .catch(function (err) {
        console.error('Service worker: error handling alarm fire', err);
      });
  }

  /* ---------------------------------------------------------------- */
  /*  Notification button actions                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Handle notification button clicks (Snooze or Dismiss).
   *
   * Button indices: 0 = Snooze, 1 = Dismiss
   *
   * @param {string} notificationId
   * @param {number} buttonIndex
   */
  function onNotificationButtonClicked(notificationId, buttonIndex) {
    // Only handle our alarm notifications
    if (notificationId.indexOf(ALARM_PREFIX) !== 0) {
      return;
    }

    var alarmId = notificationId.slice(ALARM_PREFIX.length);

    // Close the notification
    chrome.notifications.clear(notificationId, function () {});

    if (buttonIndex === 0) {
      // Snooze
      handleSnooze(alarmId);
    } else {
      // Dismiss
      handleDismiss(alarmId);
    }
  }

  /**
   * Schedule a snooze for the given alarm.
   * Persists a snooze record and creates a chrome.alarms entry.
   *
   * @param {string} alarmId
   */
  function handleSnooze(alarmId) {
    var snoozeUntil = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000).toISOString();

    storage
      .loadSnoozes()
      .then(function (snoozes) {
        // Remove any existing snooze for this alarm
        var filtered = snoozes.filter(function (s) {
          return s.alarmId !== alarmId;
        });
        filtered.push({
          alarmId: alarmId,
          snoozeUntil: snoozeUntil,
          notificationId: ALARM_PREFIX + alarmId,
        });
        return storage.saveSnoozes(filtered);
      })
      .then(function () {
        return scheduleSnooze(alarmId);
      })
      .catch(function (err) {
        console.error('Service worker: error scheduling snooze', err);
      });
  }

  /**
   * Handle dismissal of an alarm notification.
   * For repeating alarms, the next occurrence is already scheduled.
   * For one-time alarms, the alarm was already marked completed on fire.
   *
   * @param {string} alarmId
   */
  function handleDismiss(alarmId) {
    // Clean up any snooze record for this alarm
    storage
      .loadSnoozes()
      .then(function (snoozes) {
        var filtered = snoozes.filter(function (s) {
          return s.alarmId !== alarmId;
        });
        return storage.saveSnoozes(filtered);
      })
      .then(function () {
        // Clear any pending snooze chrome.alarm
        return new Promise(function (resolve) {
          chrome.alarms.clear(SNOOZE_PREFIX + alarmId, function () {
            resolve();
          });
        });
      })
      .catch(function (err) {
        console.error('Service worker: error handling dismiss', err);
      });
  }

  /**
   * Handle notification closed without button click.
   * Treat as implicit dismiss.
   *
   * @param {string} notificationId
   * @param {boolean} byUser
   */
  function onNotificationClosed(notificationId, byUser) {
    if (!byUser) {
      return;
    }
    if (notificationId.indexOf(ALARM_PREFIX) !== 0) {
      return;
    }
    var alarmId = notificationId.slice(ALARM_PREFIX.length);
    handleDismiss(alarmId);
  }

  /* ---------------------------------------------------------------- */
  /*  Event listeners                                                  */
  /* ---------------------------------------------------------------- */

  chrome.runtime.onInstalled.addListener(function () {
    rehydrateAlarms();
  });

  chrome.runtime.onStartup.addListener(function () {
    rehydrateAlarms();
  });

  chrome.alarms.onAlarm.addListener(onAlarmFired);

  chrome.notifications.onButtonClicked.addListener(onNotificationButtonClicked);

  chrome.notifications.onClosed.addListener(onNotificationClosed);

  /* ---------------------------------------------------------------- */
  /*  Exports for testing                                              */
  /* ---------------------------------------------------------------- */

  // eslint-disable-next-line no-undef
  if (typeof module !== 'undefined' && module.exports) {
    // eslint-disable-next-line no-undef
    module.exports = {
      ALARM_PREFIX: ALARM_PREFIX,
      SNOOZE_PREFIX: SNOOZE_PREFIX,
      MISSED_THRESHOLD_MS: MISSED_THRESHOLD_MS,
      SNOOZE_MINUTES: SNOOZE_MINUTES,
      scheduleAlarm: scheduleAlarm,
      clearAlarm: clearAlarm,
      scheduleSnooze: scheduleSnooze,
      rehydrateAlarms: rehydrateAlarms,
      fireNotification: fireNotification,
      onAlarmFired: onAlarmFired,
      onNotificationButtonClicked: onNotificationButtonClicked,
      handleSnooze: handleSnooze,
      handleDismiss: handleDismiss,
    };
  }
})();
