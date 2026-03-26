var path = require('path');
var readiness = require('../scripts/check-readiness');

var scanLines = readiness.scanLines;
var createViolation = readiness.createViolation;
var snippet = readiness.snippet;
var checkCSP = readiness.checkCSP;
var checkOffline = readiness.checkOffline;
var checkManifest = readiness.checkManifest;
var validateManifestObject = readiness.validateManifestObject;
var ROOT = readiness.ROOT;

var FIXTURE_DIR = path.join(__dirname, 'fixtures', 'readiness');

/**
 * Builds a file list containing a single fixture file,
 * using a path relative to the project ROOT so readFileSafe can locate it.
 */
function fixtureFiles(filename) {
  return [path.relative(ROOT, path.join(FIXTURE_DIR, filename))];
}

/** Returns a valid baseline manifest object. */
function goodManifest(overrides) {
  var base = {
    manifest_version: 3,
    name: 'Test',
    version: '1.0',
    description: 'test',
    icons: {},
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  };
  return Object.assign(base, overrides || {});
}

/* ------------------------------------------------------------------ */
/*  Helper unit tests                                                  */
/* ------------------------------------------------------------------ */

describe('snippet', function () {
  it('returns short text unchanged', function () {
    expect(snippet('hello', 10)).toBe('hello');
  });

  it('truncates long text with ellipsis', function () {
    var result = snippet('abcdefghij', 5);
    expect(result).toBe('abcde…');
    expect(result.length).toBe(6);
  });

  it('defaults to 60 characters', function () {
    var long = 'a'.repeat(80);
    expect(snippet(long)).toBe('a'.repeat(60) + '…');
  });
});

describe('createViolation', function () {
  it('creates a violation object with file, line, and message', function () {
    var v = createViolation('foo.js', 10, 'bad thing');
    expect(v).toEqual({ file: 'foo.js', line: 10, message: 'bad thing' });
  });

  it('accepts null line', function () {
    var v = createViolation('foo.js', null, 'bad thing');
    expect(v.line).toBeNull();
  });
});

describe('scanLines', function () {
  it('returns matches with 1-based line numbers', function () {
    var content = 'aaa\nbbb\nccc\nbbb again';
    var hits = scanLines(content, /bbb/);
    expect(hits).toHaveLength(2);
    expect(hits[0].line).toBe(2);
    expect(hits[1].line).toBe(4);
  });

  it('returns empty array when no matches', function () {
    expect(scanLines('hello world', /zzz/)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  CSP checks                                                         */
/* ------------------------------------------------------------------ */

describe('checkCSP', function () {
  it('passes on clean HTML with external script', function () {
    var violations = checkCSP(fixtureFiles('good.html'));
    expect(violations).toHaveLength(0);
  });

  it('passes on clean JS without eval or new Function', function () {
    var violations = checkCSP(fixtureFiles('good.js'));
    expect(violations).toHaveLength(0);
  });

  it('detects inline <script> tags without src', function () {
    var violations = checkCSP(fixtureFiles('bad-inline-script.html'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toMatch(/inline.*script/i);
    expect(violations[0].line).toBe(7);
  });

  it('detects inline event handler attributes', function () {
    var violations = checkCSP(fixtureFiles('bad-handler.html'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toMatch(/event handler/i);
    expect(violations[0].line).toBe(7);
  });

  it('detects eval( in JS files', function () {
    var violations = checkCSP(fixtureFiles('bad-eval.js'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toMatch(/eval/);
    expect(violations[0].line).toBe(3);
  });

  it('detects new Function( in JS files', function () {
    var violations = checkCSP(fixtureFiles('bad-new-function.js'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toMatch(/new Function/);
    expect(violations[0].line).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Offline-only checks                                                */
/* ------------------------------------------------------------------ */

describe('checkOffline', function () {
  it('passes on clean JS without network APIs', function () {
    var violations = checkOffline(fixtureFiles('good.js'));
    expect(violations).toHaveLength(0);
  });

  it('detects fetch( usage', function () {
    var violations = checkOffline(fixtureFiles('bad-fetch.js'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(
      violations.some(function (v) {
        return v.message.match(/fetch\(/);
      })
    ).toBe(true);
  });

  it('detects XMLHttpRequest usage', function () {
    var violations = checkOffline(fixtureFiles('bad-xhr.js'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(
      violations.some(function (v) {
        return v.message.match(/XMLHttpRequest/);
      })
    ).toBe(true);
  });

  it('detects WebSocket usage', function () {
    var violations = checkOffline(fixtureFiles('bad-websocket.js'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(
      violations.some(function (v) {
        return v.message.match(/WebSocket/);
      })
    ).toBe(true);
  });

  it('detects EventSource usage', function () {
    var violations = checkOffline(fixtureFiles('bad-eventsource.js'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(
      violations.some(function (v) {
        return v.message.match(/EventSource/);
      })
    ).toBe(true);
  });

  it('detects remote http/https URLs in HTML', function () {
    var violations = checkOffline(fixtureFiles('bad-remote-url.html'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toMatch(/remote url/i);
  });

  it('detects protocol-relative URLs in HTML', function () {
    var violations = checkOffline(fixtureFiles('bad-protocol-relative.html'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toMatch(/protocol-relative/i);
  });

  it('detects protocol-relative URLs in CSS url()', function () {
    var violations = checkOffline(fixtureFiles('bad-remote-url.css'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toMatch(/protocol-relative/i);
  });

  it('allows chrome-extension:// URLs', function () {
    var violations = checkOffline(fixtureFiles('good-chrome-extension.html'));
    expect(violations).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Manifest checks                                                    */
/* ------------------------------------------------------------------ */

describe('checkManifest', function () {
  it('passes on the current compliant manifest.json', function () {
    var violations = checkManifest([]);
    expect(violations).toHaveLength(0);
  });
});

describe('validateManifestObject', function () {
  it('passes on a valid minimal manifest', function () {
    var violations = validateManifestObject(goodManifest());
    expect(violations).toHaveLength(0);
  });

  it('fails if manifest_version is not 3', function () {
    var violations = validateManifestObject(goodManifest({ manifest_version: 2 }));
    expect(
      violations.some(function (v) {
        return v.message.match(/manifest_version/);
      })
    ).toBe(true);
  });

  it('allows the storage permission', function () {
    var violations = validateManifestObject(goodManifest({ permissions: ['storage'] }));
    expect(violations).toHaveLength(0);
  });

  it('allows the alarms permission', function () {
    var violations = validateManifestObject(goodManifest({ permissions: ['alarms'] }));
    expect(violations).toHaveLength(0);
  });

  it('allows the notifications permission', function () {
    var violations = validateManifestObject(goodManifest({ permissions: ['notifications'] }));
    expect(violations).toHaveLength(0);
  });

  it('allows all required permissions together', function () {
    var violations = validateManifestObject(
      goodManifest({ permissions: ['storage', 'alarms', 'notifications'] })
    );
    expect(violations).toHaveLength(0);
  });

  it('fails if a disallowed permission is present', function () {
    var violations = validateManifestObject(goodManifest({ permissions: ['tabs'] }));
    expect(
      violations.some(function (v) {
        return v.message.match(/disallowed permissions/);
      })
    ).toBe(true);
  });

  it('fails if disallowed permission is mixed with allowed ones', function () {
    var violations = validateManifestObject(
      goodManifest({ permissions: ['storage', 'activeTab'] })
    );
    expect(
      violations.some(function (v) {
        return v.message.match(/disallowed permissions/);
      })
    ).toBe(true);
  });

  it('fails if host_permissions is non-empty', function () {
    var violations = validateManifestObject(goodManifest({ host_permissions: ['https://*/*'] }));
    expect(
      violations.some(function (v) {
        return v.message.match(/host_permissions/);
      })
    ).toBe(true);
  });

  it('fails if content_security_policy.extension_pages is missing', function () {
    var manifest = goodManifest();
    delete manifest.content_security_policy;
    var violations = validateManifestObject(manifest);
    expect(
      violations.some(function (v) {
        return v.message.match(/extension_pages.*missing/i);
      })
    ).toBe(true);
  });

  it('fails if CSP contains unsafe-inline', function () {
    var violations = validateManifestObject(
      goodManifest({
        content_security_policy: {
          extension_pages: "script-src 'self' 'unsafe-inline'",
        },
      })
    );
    expect(
      violations.some(function (v) {
        return v.message.match(/unsafe-inline/);
      })
    ).toBe(true);
  });

  it('fails if CSP contains unsafe-eval', function () {
    var violations = validateManifestObject(
      goodManifest({
        content_security_policy: {
          extension_pages: "script-src 'self' 'unsafe-eval'",
        },
      })
    );
    expect(
      violations.some(function (v) {
        return v.message.match(/unsafe-eval/);
      })
    ).toBe(true);
  });

  it('allows background and chrome_url_overrides keys', function () {
    var violations = validateManifestObject(
      goodManifest({
        background: { service_worker: 'bg.js' },
        chrome_url_overrides: { newtab: 'newtab.html' },
      })
    );
    expect(violations).toHaveLength(0);
  });

  it('fails if manifest contains unexpected keys', function () {
    var violations = validateManifestObject(goodManifest({ devtools_page: 'devtools.html' }));
    expect(
      violations.some(function (v) {
        return v.message.match(/Unexpected.*devtools_page/);
      })
    ).toBe(true);
  });

  it('allows empty permissions and host_permissions arrays', function () {
    var violations = validateManifestObject(
      goodManifest({ permissions: [], host_permissions: [] })
    );
    expect(violations).toHaveLength(0);
  });
});
