/**
 * @jest-environment jsdom
 */

var fs = require('fs');
var path = require('path');

var htmlPath = path.resolve(__dirname, '../src/popup/popup.html');
var jsPath = path.resolve(__dirname, '../src/popup/popup.js');

describe('Popup DOM rendering', function () {
  beforeEach(function () {
    /* Load the HTML body content (strip script tag to avoid double-load) */
    var html = fs.readFileSync(htmlPath, 'utf8');
    document.documentElement.innerHTML = html;

    /* Execute popup.js in the jsdom context */
    var script = fs.readFileSync(jsPath, 'utf8');
    eval(script); // eslint-disable-line no-eval

    /* Fire DOMContentLoaded so the popup init code runs */
    document.dispatchEvent(new Event('DOMContentLoaded'));
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
