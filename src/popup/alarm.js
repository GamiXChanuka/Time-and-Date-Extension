/**
 * Alarm Clock — popup alarm view module.
 *
 * Provides initAlarmView() / destroyAlarmView() lifecycle hooks so the
 * popup tab-switcher can mount and unmount the alarm UI on demand.
 *
 * Depends on self.AlarmStorage (loaded via alarm-storage.js script tag).
 * All event handlers are attached via addEventListener (MV3 CSP compliant).
 */

(function () {
  'use strict';

  var storage = self.AlarmStorage;

  /* ------------------------------------------------------------------ */
  /*  Constants                                                          */
  /* ------------------------------------------------------------------ */

  var ALARM_PREFIX = 'alarm-';
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ------------------------------------------------------------------ */
  /*  DOM references (populated in initAlarmView)                        */
  /* ------------------------------------------------------------------ */

  var _formSection = null;
  var _formHeading = null;
  var _form = null;
  var _timeInput = null;
  var _labelInput = null;
  var _repeatDayCheckboxes = null;
  var _enabledToggle = null;
  var _saveBtn = null;
  var _cancelBtn = null;
  var _formErrors = null;
  var _alarmList = null;
  var _emptyState = null;
  var _statusEl = null;

  /** ID of the alarm being edited, or null for create mode. */
  var _editingAlarmId = null;

  /** Timer for clearing status announcements. */
  var _statusClearTimer = null;

  /** Whether the view is currently initialised. */
  var _initialised = false;

  /** Bound handler refs for clean removal in destroyAlarmView. */
  var _boundHandleSave = null;
  var _boundHandleCancel = null;

  /* ------------------------------------------------------------------ */
  /*  Formatting helpers                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Format hour and minute as HH:MM string.
   * @param {number} hour
   * @param {number} minute
   * @returns {string}
   */
  function formatTime(hour, minute) {
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }

  /**
   * Format repeatDays array as a human-readable string.
   * @param {number[]} days - Day indices (0=Sun, 6=Sat)
   * @returns {string}
   */
  function formatRepeatDays(days) {
    if (!days || days.length === 0) {
      return 'One-time';
    }
    if (days.length === 7) {
      return 'Every day';
    }

    var weekdays = [1, 2, 3, 4, 5];
    if (
      days.length === 5 &&
      weekdays.every(function (d) {
        return days.indexOf(d) !== -1;
      })
    ) {
      return 'Weekdays';
    }

    if (days.length === 2 && days.indexOf(0) !== -1 && days.indexOf(6) !== -1) {
      return 'Weekends';
    }

    return days
      .map(function (d) {
        return DAY_NAMES[d];
      })
      .join(', ');
  }

  /**
   * Format an ISO nextFireAt string for display.
   * @param {string|null} isoString
   * @returns {string}
   */
  function formatNextFire(isoString) {
    if (!isoString) {
      return 'Not scheduled';
    }
    try {
      var date = new Date(isoString);
      var now = new Date();
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var tomorrowStart = new Date(todayStart.getTime() + 86400000);
      var dayAfterTomorrow = new Date(tomorrowStart.getTime() + 86400000);

      var timeStr =
        String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');

      if (date >= todayStart && date < tomorrowStart) {
        return 'Today at ' + timeStr;
      }
      if (date >= tomorrowStart && date < dayAfterTomorrow) {
        return 'Tomorrow at ' + timeStr;
      }

      return DAY_NAMES[date.getDay()] + ' at ' + timeStr;
    } catch (e) {
      return 'Not scheduled';
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Status announcements                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Post a polite screen-reader announcement to the #status live region.
   * Reuses the shared popup status element.
   *
   * @param {string} message
   */
  function announceStatus(message) {
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
      }, 3000);
    }, 0);
  }

  /* ------------------------------------------------------------------ */
  /*  chrome.alarms helpers                                              */
  /* ------------------------------------------------------------------ */

  function _hasChromeAlarms() {
    return typeof chrome !== 'undefined' && !!chrome.alarms;
  }

  function _scheduleChromeAlarm(alarm) {
    if (!_hasChromeAlarms() || !alarm.enabled || !alarm.nextFireAt) {
      return;
    }
    var when = new Date(alarm.nextFireAt).getTime();
    if (when > Date.now()) {
      chrome.alarms.create(ALARM_PREFIX + alarm.id, { when: when });
    }
  }

  function _clearChromeAlarm(alarmId) {
    if (!_hasChromeAlarms()) {
      return;
    }
    chrome.alarms.clear(ALARM_PREFIX + alarmId);
  }

  /* ------------------------------------------------------------------ */
  /*  Form management                                                    */
  /* ------------------------------------------------------------------ */

  function _readFormValues() {
    var timeValue = _timeInput ? _timeInput.value : '';
    var parts = timeValue.split(':');
    var hour = parts.length >= 2 ? parseInt(parts[0], 10) : NaN;
    var minute = parts.length >= 2 ? parseInt(parts[1], 10) : NaN;

    var label = _labelInput ? _labelInput.value.trim() : '';
    var enabled = _enabledToggle ? _enabledToggle.checked : true;

    var repeatDays = [];
    if (_repeatDayCheckboxes) {
      for (var i = 0; i < _repeatDayCheckboxes.length; i++) {
        if (_repeatDayCheckboxes[i].checked) {
          repeatDays.push(parseInt(_repeatDayCheckboxes[i].value, 10));
        }
      }
    }

    return {
      hour: hour,
      minute: minute,
      label: label,
      enabled: enabled,
      repeatDays: repeatDays,
    };
  }

  function _showFormErrors(errors) {
    if (!_formErrors) {
      return;
    }
    _formErrors.textContent = errors.join('. ');
  }

  function _clearFormErrors() {
    if (_formErrors) {
      _formErrors.textContent = '';
    }
  }

  function resetForm() {
    _editingAlarmId = null;

    if (_formHeading) {
      _formHeading.textContent = 'New Alarm';
    }
    if (_timeInput) {
      _timeInput.value = '';
    }
    if (_labelInput) {
      _labelInput.value = '';
    }
    if (_enabledToggle) {
      _enabledToggle.checked = true;
    }
    if (_repeatDayCheckboxes) {
      for (var i = 0; i < _repeatDayCheckboxes.length; i++) {
        _repeatDayCheckboxes[i].checked = false;
      }
    }
    if (_cancelBtn) {
      _cancelBtn.hidden = true;
    }
    if (_saveBtn) {
      _saveBtn.textContent = 'Save';
    }

    _clearFormErrors();
  }

  function populateFormForEdit(alarm) {
    _editingAlarmId = alarm.id;

    if (_formHeading) {
      _formHeading.textContent = 'Edit Alarm';
    }
    if (_timeInput) {
      _timeInput.value = formatTime(alarm.hour, alarm.minute);
    }
    if (_labelInput) {
      _labelInput.value = alarm.label || '';
    }
    if (_enabledToggle) {
      _enabledToggle.checked = alarm.enabled;
    }
    if (_repeatDayCheckboxes) {
      for (var i = 0; i < _repeatDayCheckboxes.length; i++) {
        var dayVal = parseInt(_repeatDayCheckboxes[i].value, 10);
        _repeatDayCheckboxes[i].checked = alarm.repeatDays.indexOf(dayVal) !== -1;
      }
    }
    if (_cancelBtn) {
      _cancelBtn.hidden = false;
    }
    if (_saveBtn) {
      _saveBtn.textContent = 'Update';
    }

    _clearFormErrors();

    if (_timeInput) {
      _timeInput.focus();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Alarm list rendering                                               */
  /* ------------------------------------------------------------------ */

  function renderAlarmList(alarms) {
    if (!_alarmList) {
      return;
    }

    _alarmList.innerHTML = '';

    if (_emptyState) {
      _emptyState.hidden = alarms.length > 0;
    }

    for (var i = 0; i < alarms.length; i++) {
      var card = _createAlarmCard(alarms[i]);
      _alarmList.appendChild(card);
    }
  }

  function _createAlarmCard(alarm) {
    var card = document.createElement('div');
    card.className = 'alarm-card';
    card.setAttribute('data-alarm-id', alarm.id);
    card.setAttribute('data-disabled', alarm.enabled ? 'false' : 'true');

    // Info section
    var info = document.createElement('div');
    info.className = 'alarm-info';

    var timeEl = document.createElement('div');
    timeEl.className = 'alarm-time';
    timeEl.textContent = formatTime(alarm.hour, alarm.minute);
    info.appendChild(timeEl);

    if (alarm.label) {
      var labelEl = document.createElement('div');
      labelEl.className = 'alarm-label';
      labelEl.textContent = alarm.label;
      info.appendChild(labelEl);
    }

    var meta = document.createElement('div');
    meta.className = 'alarm-meta';
    var repeatStr = formatRepeatDays(alarm.repeatDays);
    var nextStr = formatNextFire(alarm.nextFireAt);
    meta.textContent = repeatStr + ' \u00b7 ' + nextStr;
    info.appendChild(meta);

    card.appendChild(info);

    // Actions
    var actions = document.createElement('div');
    actions.className = 'alarm-actions';

    // Enable/disable toggle
    var toggleLabel = document.createElement('label');
    toggleLabel.className = 'alarm-toggle-label';
    toggleLabel.setAttribute('title', alarm.enabled ? 'Disable alarm' : 'Enable alarm');

    var toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = alarm.enabled;
    toggleInput.setAttribute(
      'aria-label',
      (alarm.enabled ? 'Disable' : 'Enable') + ' alarm' + (alarm.label ? ' ' + alarm.label : '')
    );
    toggleInput.addEventListener('change', _createToggleHandler(alarm.id));
    toggleLabel.appendChild(toggleInput);
    actions.appendChild(toggleLabel);

    // Edit button
    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-icon';
    editBtn.textContent = 'Edit';
    editBtn.setAttribute('aria-label', 'Edit alarm' + (alarm.label ? ' ' + alarm.label : ''));
    editBtn.addEventListener('click', _createEditHandler(alarm.id));
    actions.appendChild(editBtn);

    // Delete button
    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-icon btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('aria-label', 'Delete alarm' + (alarm.label ? ' ' + alarm.label : ''));
    deleteBtn.addEventListener('click', _createDeleteHandler(alarm.id));
    actions.appendChild(deleteBtn);

    card.appendChild(actions);

    return card;
  }

  /* ------------------------------------------------------------------ */
  /*  Event handler factories                                            */
  /* ------------------------------------------------------------------ */

  function _createToggleHandler(alarmId) {
    return function () {
      var checkbox = this;
      handleToggleEnabled(alarmId, checkbox.checked);
    };
  }

  function _createEditHandler(alarmId) {
    return function () {
      handleEdit(alarmId);
    };
  }

  function _createDeleteHandler(alarmId) {
    return function () {
      handleDelete(alarmId);
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Action handlers                                                    */
  /* ------------------------------------------------------------------ */

  function handleSave(evt) {
    evt.preventDefault();
    _clearFormErrors();

    var data = _readFormValues();

    if (isNaN(data.hour) || isNaN(data.minute)) {
      _showFormErrors(['Please enter a valid time']);
      if (_timeInput) {
        _timeInput.focus();
      }
      return;
    }

    var validation = storage.validateAlarm(data);
    if (!validation.valid) {
      _showFormErrors(validation.errors);
      if (_timeInput) {
        _timeInput.focus();
      }
      return;
    }

    if (_editingAlarmId) {
      storage
        .updateAlarm(_editingAlarmId, data)
        .then(function (updated) {
          _clearChromeAlarm(updated.id);
          _scheduleChromeAlarm(updated);
          resetForm();
          announceStatus('Alarm updated');
          return refreshList();
        })
        .catch(function (err) {
          _showFormErrors([err.message]);
        });
    } else {
      storage
        .createAlarm(data)
        .then(function (created) {
          _scheduleChromeAlarm(created);
          resetForm();
          announceStatus('Alarm created');
          return refreshList();
        })
        .catch(function (err) {
          _showFormErrors([err.message]);
        });
    }
  }

  function handleCancel() {
    resetForm();
    if (_timeInput) {
      _timeInput.focus();
    }
    announceStatus('Edit cancelled');
  }

  function handleToggleEnabled(alarmId, enabled) {
    storage
      .updateAlarm(alarmId, { enabled: enabled })
      .then(function (updated) {
        if (enabled) {
          _scheduleChromeAlarm(updated);
        } else {
          _clearChromeAlarm(alarmId);
        }
        announceStatus(enabled ? 'Alarm enabled' : 'Alarm disabled');
        return refreshList();
      })
      .catch(function (err) {
        console.error('Failed to toggle alarm:', err);
        announceStatus('Could not update alarm');
      });
  }

  function handleEdit(alarmId) {
    storage
      .getAlarm(alarmId)
      .then(function (alarm) {
        if (alarm) {
          populateFormForEdit(alarm);
          if (_formSection) {
            _formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      })
      .catch(function (err) {
        console.error('Failed to load alarm for editing:', err);
        announceStatus('Could not load alarm');
      });
  }

  function handleDelete(alarmId) {
    if (_editingAlarmId === alarmId) {
      resetForm();
    }

    _clearChromeAlarm(alarmId);

    storage
      .deleteAlarm(alarmId)
      .then(function () {
        announceStatus('Alarm deleted');
        return refreshList();
      })
      .then(function () {
        if (_alarmList && _alarmList.firstChild) {
          var firstToggle = _alarmList.querySelector('input[type="checkbox"]');
          if (firstToggle) {
            firstToggle.focus();
          }
        } else if (_timeInput) {
          _timeInput.focus();
        }
      })
      .catch(function (err) {
        console.error('Failed to delete alarm:', err);
        announceStatus('Could not delete alarm');
      });
  }

  /* ------------------------------------------------------------------ */
  /*  Data refresh                                                       */
  /* ------------------------------------------------------------------ */

  function refreshList() {
    return storage.loadAlarms().then(function (alarms) {
      renderAlarmList(alarms);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Lifecycle: init / destroy                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Initialise the alarm view — query DOM elements and wire listeners.
   * Safe to call multiple times; no-ops if already initialised.
   */
  function initAlarmView() {
    if (_initialised) {
      return;
    }

    _formSection = document.getElementById('alarmFormSection');
    _formHeading = document.getElementById('alarmFormHeading');
    _form = document.getElementById('alarmForm');
    _timeInput = document.getElementById('alarmTimeInput');
    _labelInput = document.getElementById('alarmLabelInput');
    _repeatDayCheckboxes = document.querySelectorAll('#alarmRepeatDays input[type="checkbox"]');
    _enabledToggle = document.getElementById('alarmEnabledToggle');
    _saveBtn = document.getElementById('alarmSaveBtn');
    _cancelBtn = document.getElementById('alarmCancelBtn');
    _formErrors = document.getElementById('alarmFormErrors');
    _alarmList = document.getElementById('alarmList');
    _emptyState = document.getElementById('alarmEmptyState');
    _statusEl = document.getElementById('status');

    _boundHandleSave = handleSave;
    _boundHandleCancel = handleCancel;

    if (_form) {
      _form.addEventListener('submit', _boundHandleSave);
    }
    if (_cancelBtn) {
      _cancelBtn.addEventListener('click', _boundHandleCancel);
    }

    _initialised = true;

    if (!storage) {
      if (_emptyState) {
        _emptyState.textContent = 'Alarm Clock failed to load. Please reload.';
      }
      return;
    }

    refreshList().catch(function (err) {
      console.error('Failed to load alarms:', err);
      if (_emptyState) {
        _emptyState.textContent = 'Could not load alarms. Please reload.';
        _emptyState.hidden = false;
      }
    });
  }

  /**
   * Tear down the alarm view — remove listeners and clear timers.
   * Resets internal state so initAlarmView can be called again later.
   */
  function destroyAlarmView() {
    if (!_initialised) {
      return;
    }

    if (_form && _boundHandleSave) {
      _form.removeEventListener('submit', _boundHandleSave);
    }
    if (_cancelBtn && _boundHandleCancel) {
      _cancelBtn.removeEventListener('click', _boundHandleCancel);
    }

    if (_statusClearTimer) {
      clearTimeout(_statusClearTimer);
      _statusClearTimer = null;
    }

    resetForm();

    _formSection = null;
    _formHeading = null;
    _form = null;
    _timeInput = null;
    _labelInput = null;
    _repeatDayCheckboxes = null;
    _enabledToggle = null;
    _saveBtn = null;
    _cancelBtn = null;
    _formErrors = null;
    _alarmList = null;
    _emptyState = null;
    _statusEl = null;
    _boundHandleSave = null;
    _boundHandleCancel = null;
    _initialised = false;
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  var AlarmUI = {
    init: initAlarmView,
    destroy: destroyAlarmView,
    refresh: refreshList,
  };

  /* Expose on self for browser, module.exports for tests */
  self.AlarmUI = AlarmUI;
})();

// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && module.exports) {
  // eslint-disable-next-line no-undef
  module.exports = self.AlarmUI;
}
