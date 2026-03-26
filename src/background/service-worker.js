/**
 * Background service worker for the Alarm Clock extension.
 *
 * Handles chrome.alarms events, notification actions, and
 * alarm rehydration on extension startup. Implementation will
 * be added in later steps.
 */

(function () {
  'use strict';

  /**
   * Rehydrates enabled alarms from storage on service worker startup.
   * Placeholder — scheduling logic will be added in Step 3.
   */
  function onInstalled() {
    // Will rehydrate alarms from chrome.storage.local
  }

  chrome.runtime.onInstalled.addListener(onInstalled);
})();
