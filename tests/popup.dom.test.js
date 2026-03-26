/**
 * @jest-environment jsdom
 */

var fs = require('fs');
var path = require('path');

var htmlPath = path.resolve(__dirname, '../src/popup/popup.html');
var jsPath = path.resolve(__dirname, '../src/popup/popup.js');

/* Helper: load HTML, eval popup.js, and fire DOMContentLoaded */
function loadPopup() {
  var html = fs.readFileSync(htmlPath, 'utf8');
  document.documentElement.innerHTML = html;

  var script = fs.readFileSync(jsPath, 'utf8');
  eval(script); // eslint-disable-line no-eval

  document.dispatchEvent(new Event('DOMContentLoaded'));
}

describe('Popup DOM rendering', function () {
  beforeEach(function () {
    jest.useFakeTimers();
    loadPopup();
  });

  afterEach(function () {
    jest.useRealTimers();
  });

  it('timeValue has non-empty textContent', function () {
    var timeEl = document.getElementById('timeValue');
    expect(timeEl).not.toBeNull();
    expect(timeEl.textContent.trim().length).toBeGreaterThan(0);
  });

  it('dateValue has non-empty textContent', function () {
    var dateEl = document.getElementById('dateValue');
    expect(dateEl).not.toBeNull();
    expect(dateEl.textContent.trim().length).toBeGreaterThan(0);
  });

  it('timeValue datetime is a full UTC ISO 8601 timestamp', function () {
    var timeEl = document.getElementById('timeValue');
    var dt = timeEl.getAttribute('datetime');
    expect(dt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('dateValue datetime is a local YYYY-MM-DD string', function () {
    var dateEl = document.getElementById('dateValue');
    var dt = dateEl.getAttribute('datetime');
    expect(dt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('refresh button updates time elements', function () {
    var timeEl = document.getElementById('timeValue');
    var dateEl = document.getElementById('dateValue');
    var btn = document.getElementById('refreshBtn');

    btn.click();

    /* After click, attributes should still be non-empty and well-formatted */
    var timeAfter = timeEl.getAttribute('datetime');
    var dateAfter = dateEl.getAttribute('datetime');

    expect(timeAfter).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(dateAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(timeAfter.length).toBeGreaterThan(0);
    expect(dateAfter.length).toBeGreaterThan(0);

    /* Text content should also remain populated */
    expect(timeEl.textContent.trim().length).toBeGreaterThan(0);
    expect(dateEl.textContent.trim().length).toBeGreaterThan(0);
  });

  it('status element receives announcement on refresh', function () {
    var btn = document.getElementById('refreshBtn');
    var statusEl = document.getElementById('status');

    btn.click();

    expect(statusEl.textContent).toBe('Time and date updated');
  });
});

describe('Popup timer lifecycle', function () {
  beforeEach(function () {
    jest.useFakeTimers();
  });

  afterEach(function () {
    jest.useRealTimers();
  });

  it('starts exactly one interval on init', function () {
    var spySetInterval = jest.spyOn(global, 'setInterval');

    loadPopup();

    expect(spySetInterval).toHaveBeenCalledTimes(1);
    spySetInterval.mockRestore();
  });

  it('refresh click triggers render without creating a new interval', function () {
    var spySetInterval = jest.spyOn(global, 'setInterval');

    loadPopup();

    expect(spySetInterval).toHaveBeenCalledTimes(1);

    var btn = document.getElementById('refreshBtn');
    btn.click();
    btn.click();

    /* No additional intervals created by clicks */
    expect(spySetInterval).toHaveBeenCalledTimes(1);

    /* Display still updated after clicks */
    var timeEl = document.getElementById('timeValue');
    expect(timeEl.textContent.trim().length).toBeGreaterThan(0);

    spySetInterval.mockRestore();
  });

  it('visibilitychange to hidden clears the interval', function () {
    var spyClearInterval = jest.spyOn(global, 'clearInterval');

    loadPopup();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(spyClearInterval).toHaveBeenCalled();
    spyClearInterval.mockRestore();
  });

  it('visibilitychange to visible restarts ticker without duplicates', function () {
    loadPopup();

    /* Go hidden to stop the ticker */
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));

    /* Spy after hidden so we only count the restart */
    var spySetInterval = jest.spyOn(global, 'setInterval');

    /* Return to visible */
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));

    var restartCount = spySetInterval.mock.calls.length;

    /* Going visible again should not create a duplicate (guard prevents it) */
    document.dispatchEvent(new Event('visibilitychange'));

    expect(spySetInterval.mock.calls.length).toBe(restartCount);

    spySetInterval.mockRestore();
  });

  it('stopTicker called multiple times does not throw and leaves interval cleared', function () {
    loadPopup();

    /* First pagehide clears the interval */
    expect(function () {
      window.dispatchEvent(new Event('pagehide'));
    }).not.toThrow();

    /* Spy after first cleanup so we can verify subsequent calls are no-ops */
    var spyClearInterval = jest.spyOn(global, 'clearInterval');

    /* Additional pagehide events should not call clearInterval (intervalId is null) */
    expect(function () {
      window.dispatchEvent(new Event('pagehide'));
    }).not.toThrow();

    expect(function () {
      window.dispatchEvent(new Event('pagehide'));
    }).not.toThrow();

    /* clearInterval should not have been called — stopTicker skips when _intervalId is null */
    expect(spyClearInterval).not.toHaveBeenCalled();

    spyClearInterval.mockRestore();
  });
});

describe('Popup with missing DOM elements', function () {
  beforeEach(function () {
    jest.useFakeTimers();
  });

  afterEach(function () {
    jest.useRealTimers();
  });

  it('does not throw and logs warning when DOM elements are absent', function () {
    var spyWarn = jest.spyOn(console, 'warn').mockImplementation(function () {});

    /* Set up empty body — no popup elements present */
    document.documentElement.innerHTML = '<html><head></head><body></body></html>';

    var script = fs.readFileSync(jsPath, 'utf8');
    eval(script); // eslint-disable-line no-eval

    expect(function () {
      document.dispatchEvent(new Event('DOMContentLoaded'));
    }).not.toThrow();

    /* At least one warning should list the missing selectors */
    var missingCalls = spyWarn.mock.calls.filter(function (call) {
      return call[0] && call[0].indexOf('missing DOM elements') !== -1;
    });
    expect(missingCalls.length).toBeGreaterThanOrEqual(1);
    var warnMsg = missingCalls[0][0];
    expect(warnMsg).toContain('#timeValue');
    expect(warnMsg).toContain('#dateValue');
    expect(warnMsg).toContain('#refreshBtn');

    spyWarn.mockRestore();
  });
});
