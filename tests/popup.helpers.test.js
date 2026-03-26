var helpers = require('../src/popup/popup.js');
var formatTime = helpers.formatTime;
var formatDate = helpers.formatDate;
var timeDateTimeAttr = helpers.timeDateTimeAttr;
var toLocalISODate = helpers.toLocalISODate;

/* Fixed test dates (UTC) */
var afternoon = new Date('2026-02-25T13:45:12.345Z');
var earlyJan = new Date('2026-01-03T02:05:09.000Z');

/* ------------------------------------------------------------------ */
/*  formatTime                                                         */
/* ------------------------------------------------------------------ */

describe('formatTime', function () {
  it('returns 12-hour format with AM/PM for en-US', function () {
    var result = formatTime(afternoon, 'en-US');
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}\s[AP]M/);
  });

  it('returns 24-hour format without AM/PM for en-GB', function () {
    var result = formatTime(afternoon, 'en-GB');
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(result).not.toMatch(/[AP]M/);
  });

  it('returns 24-hour format without AM/PM for de-DE', function () {
    var result = formatTime(afternoon, 'de-DE');
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(result).not.toMatch(/[AP]M/);
  });

  it('returns a non-empty string when locale is omitted', function () {
    var result = formatTime(afternoon);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  formatDate                                                         */
/* ------------------------------------------------------------------ */

describe('formatDate', function () {
  it('returns English weekday and month for en-US', function () {
    var result = formatDate(afternoon, 'en-US');
    expect(result).toContain('Wednesday');
    expect(result).toContain('February');
    expect(result).toContain('2026');
  });

  it('returns English weekday and month for en-GB', function () {
    var result = formatDate(afternoon, 'en-GB');
    expect(result).toContain('Wednesday');
    expect(result).toContain('February');
    expect(result).toContain('2026');
  });

  it('returns German weekday and month for de-DE', function () {
    var result = formatDate(afternoon, 'de-DE');
    expect(result).toContain('Mittwoch');
    expect(result).toContain('Februar');
    expect(result).toContain('2026');
  });

  it('returns a non-empty string when locale is omitted', function () {
    var result = formatDate(afternoon);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  timeDateTimeAttr                                                   */
/* ------------------------------------------------------------------ */

describe('timeDateTimeAttr', function () {
  it('returns a valid ISO 8601 UTC timestamp', function () {
    var result = timeDateTimeAttr(afternoon);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('produces the exact expected string for a known date', function () {
    expect(timeDateTimeAttr(afternoon)).toBe('2026-02-25T13:45:12.345Z');
  });

  it('roundtrips through Date constructor', function () {
    var result = timeDateTimeAttr(afternoon);
    expect(new Date(result).toISOString()).toBe(result);
  });
});

/* ------------------------------------------------------------------ */
/*  toLocalISODate                                                     */
/* ------------------------------------------------------------------ */

describe('toLocalISODate', function () {
  it('matches YYYY-MM-DD format', function () {
    var result = toLocalISODate(afternoon);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('components match local date getters', function () {
    var result = toLocalISODate(afternoon);
    var parts = result.split('-');
    expect(Number(parts[0])).toBe(afternoon.getFullYear());
    expect(Number(parts[1])).toBe(afternoon.getMonth() + 1);
    expect(Number(parts[2])).toBe(afternoon.getDate());
  });

  it('zero-pads single-digit month', function () {
    var result = toLocalISODate(earlyJan);
    expect(result).toMatch(/^\d{4}-01-/);
  });

  it('zero-pads single-digit day', function () {
    var result = toLocalISODate(earlyJan);
    expect(result).toMatch(/-03$/);
  });
});
