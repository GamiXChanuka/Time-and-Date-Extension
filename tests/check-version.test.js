var fs = require('fs');
var os = require('os');
var path = require('path');

var checkVersionModule = require('../scripts/check-version');
var syncVersionModule = require('../scripts/sync-version');

var loadJSON = checkVersionModule.loadJSON;
var checkVersion = checkVersionModule.checkVersion;
var syncVersion = syncVersionModule.syncVersion;

var tmpDir;

/** Creates a temp directory for each test. */
beforeEach(function () {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-test-'));
});

/** Removes the temp directory after each test. */
afterEach(function () {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Writes a JSON file to the temp directory. */
function writeFixture(filename, content) {
  var filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
  return filePath;
}

/** Writes a raw string file to the temp directory. */
function writeRaw(filename, content) {
  var filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

/* ------------------------------------------------------------------ */
/*  loadJSON                                                           */
/* ------------------------------------------------------------------ */

describe('loadJSON', function () {
  it('loads and parses valid JSON', function () {
    var filePath = writeFixture('valid.json', { a: 1, b: 'two' });
    var result = loadJSON(filePath);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ a: 1, b: 'two' });
  });

  it('returns error for missing file', function () {
    var result = loadJSON(path.join(tmpDir, 'nonexistent.json'));
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/Cannot read/);
    expect(result.error).toMatch(/nonexistent\.json/);
  });

  it('returns error for invalid JSON', function () {
    var filePath = writeRaw('bad.json', '{not valid json');
    var result = loadJSON(filePath);
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/Cannot parse/);
    expect(result.error).toMatch(/bad\.json/);
  });
});

/* ------------------------------------------------------------------ */
/*  checkVersion                                                       */
/* ------------------------------------------------------------------ */

describe('checkVersion', function () {
  it('returns code 0 when versions match', function () {
    var pkg = writeFixture('package.json', { version: '1.2.3' });
    var manifest = writeFixture('manifest.json', { version: '1.2.3' });
    var result = checkVersion(pkg, manifest);
    expect(result.code).toBe(0);
    expect(result.message).toMatch(/match/i);
  });

  it('returns code 1 when versions differ', function () {
    var pkg = writeFixture('package.json', { version: '1.0.0' });
    var manifest = writeFixture('manifest.json', { version: '2.0.0' });
    var result = checkVersion(pkg, manifest);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/1\.0\.0/);
    expect(result.message).toMatch(/2\.0\.0/);
    expect(result.message).toMatch(/package\.json/);
    expect(result.message).toMatch(/manifest\.json/);
  });

  it('treats missing manifest version as mismatch', function () {
    var pkg = writeFixture('package.json', { version: '1.0.0' });
    var manifest = writeFixture('manifest.json', { name: 'test' });
    var result = checkVersion(pkg, manifest);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/no 'version' field/);
  });

  it('fails when package.json has no version field', function () {
    var pkg = writeFixture('package.json', { name: 'test' });
    var manifest = writeFixture('manifest.json', { version: '1.0.0' });
    var result = checkVersion(pkg, manifest);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/does not contain a 'version' field/);
  });

  it('fails when manifest file is missing', function () {
    var pkg = writeFixture('package.json', { version: '1.0.0' });
    var missing = path.join(tmpDir, 'missing.json');
    var result = checkVersion(pkg, missing);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/Cannot read/);
  });

  it('fails when package file is missing', function () {
    var missing = path.join(tmpDir, 'missing.json');
    var manifest = writeFixture('manifest.json', { version: '1.0.0' });
    var result = checkVersion(missing, manifest);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/Cannot read/);
  });

  it('fails when manifest contains invalid JSON', function () {
    var pkg = writeFixture('package.json', { version: '1.0.0' });
    var manifest = writeRaw('manifest.json', '{bad json');
    var result = checkVersion(pkg, manifest);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/Cannot parse/);
  });

  it('fails when package.json contains invalid JSON', function () {
    var pkg = writeRaw('package.json', '{bad json');
    var manifest = writeFixture('manifest.json', { version: '1.0.0' });
    var result = checkVersion(pkg, manifest);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/Cannot parse/);
  });

  it('compares versions as strings without coercion', function () {
    var pkg = writeFixture('package.json', { version: '1.0.0' });
    var manifest = writeFixture('manifest.json', { version: '1.0.0.0' });
    var result = checkVersion(pkg, manifest);
    expect(result.code).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  syncVersion                                                        */
/* ------------------------------------------------------------------ */

describe('syncVersion', function () {
  it('syncs mismatched version', function () {
    var pkg = writeFixture('package.json', { version: '2.0.0' });
    var manifest = writeFixture('manifest.json', { version: '1.0.0' });
    var result = syncVersion(pkg, manifest);
    expect(result.code).toBe(0);
    expect(result.message).toMatch(/Synced/);

    var updated = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    expect(updated.version).toBe('2.0.0');
  });

  it('reports already in sync when versions match', function () {
    var pkg = writeFixture('package.json', { version: '1.0.0' });
    var manifest = writeFixture('manifest.json', { version: '1.0.0' });
    var result = syncVersion(pkg, manifest);
    expect(result.code).toBe(0);
    expect(result.message).toMatch(/already in sync/);
  });

  it('adds version field when missing from manifest', function () {
    var pkg = writeFixture('package.json', { version: '3.0.0' });
    var manifest = writeFixture('manifest.json', { name: 'test' });
    var result = syncVersion(pkg, manifest);
    expect(result.code).toBe(0);
    expect(result.message).toMatch(/Added/);

    var updated = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    expect(updated.version).toBe('3.0.0');
  });

  it('preserves other manifest fields', function () {
    var pkg = writeFixture('package.json', { version: '2.0.0' });
    var manifest = writeFixture('manifest.json', {
      manifest_version: 3,
      name: 'Test Extension',
      version: '1.0.0',
      description: 'A test',
    });
    syncVersion(pkg, manifest);

    var updated = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    expect(updated.version).toBe('2.0.0');
    expect(updated.manifest_version).toBe(3);
    expect(updated.name).toBe('Test Extension');
    expect(updated.description).toBe('A test');
  });

  it('writes pretty-printed JSON with trailing newline', function () {
    var pkg = writeFixture('package.json', { version: '1.0.0' });
    var manifest = writeFixture('manifest.json', { version: '0.0.1' });
    syncVersion(pkg, manifest);

    var raw = fs.readFileSync(manifest, 'utf8');
    expect(raw).toMatch(/^\{\n {2}"/);
    expect(raw).toMatch(/\n$/);
  });

  it('fails when package file is missing', function () {
    var missing = path.join(tmpDir, 'missing.json');
    var manifest = writeFixture('manifest.json', { version: '1.0.0' });
    var result = syncVersion(missing, manifest);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/Cannot read/);
  });

  it('fails when manifest contains invalid JSON', function () {
    var pkg = writeFixture('package.json', { version: '1.0.0' });
    var manifest = writeRaw('manifest.json', '{bad json');
    var result = syncVersion(pkg, manifest);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/Cannot parse/);
  });

  it('fails when package.json has no version field', function () {
    var pkg = writeFixture('package.json', { name: 'test' });
    var manifest = writeFixture('manifest.json', { version: '1.0.0' });
    var result = syncVersion(pkg, manifest);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/does not contain a 'version' field/);
  });
});
