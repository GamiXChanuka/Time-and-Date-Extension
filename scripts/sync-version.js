#!/usr/bin/env node

/**
 * Version Sync Script
 *
 * Copies package.json.version (authoritative) into manifest.json.version.
 * Adds the version field if missing; preserves all other manifest fields.
 * Exits with code 0 on success, 1 on error.
 * Runs fully offline with no network calls.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_PACKAGE_PATH = path.join(__dirname, '..', 'package.json');
const DEFAULT_MANIFEST_PATH = path.join(__dirname, '..', 'manifest.json');

/** Indentation size used when writing manifest.json. */
const JSON_INDENT = 2;

/**
 * Loads and parses a JSON file.
 * @param {string} filePath - Absolute path to the JSON file
 * @returns {{ data: object|null, error: string|null }}
 */
function loadJSON(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { data: null, error: `Cannot read ${filePath}: ${err.message}` };
  }
  try {
    return { data: JSON.parse(content), error: null };
  } catch (err) {
    return { data: null, error: `Cannot parse ${filePath}: ${err.message}` };
  }
}

/**
 * Syncs manifest.json.version to match package.json.version.
 * @param {string} packagePath - Path to package.json
 * @param {string} manifestPath - Path to manifest.json
 * @returns {{ code: number, message: string }}
 */
function syncVersion(packagePath, manifestPath) {
  var pkg = loadJSON(packagePath);
  if (pkg.error) {
    return { code: 1, message: 'Error: ' + pkg.error };
  }

  var pkgVersion = pkg.data.version;
  if (typeof pkgVersion !== 'string') {
    return {
      code: 1,
      message: 'Error: ' + packagePath + " does not contain a 'version' field",
    };
  }

  var manifest = loadJSON(manifestPath);
  if (manifest.error) {
    return { code: 1, message: 'Error: ' + manifest.error };
  }

  var oldVersion = manifest.data.version;
  manifest.data.version = pkgVersion;

  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest.data, null, JSON_INDENT) + '\n', 'utf8');
  } catch (err) {
    return { code: 1, message: 'Error: Cannot write ' + manifestPath + ': ' + err.message };
  }

  if (typeof oldVersion !== 'string') {
    return {
      code: 0,
      message: "\u2713 Added version '" + pkgVersion + "' to " + manifestPath,
    };
  }

  if (oldVersion === pkgVersion) {
    return {
      code: 0,
      message: "\u2713 Versions already in sync: '" + pkgVersion + "'",
    };
  }

  return {
    code: 0,
    message:
      "\u2713 Synced version: '" + oldVersion + "' \u2192 '" + pkgVersion + "' in " + manifestPath,
  };
}

/**
 * Main entry point. Parses optional CLI arguments and runs the sync.
 * Usage: sync-version.js [manifest-path] [package-path]
 * @returns {number} Exit code (0 = success, 1 = error)
 */
function main() {
  var manifestPath = process.argv[2] || DEFAULT_MANIFEST_PATH;
  var packagePath = process.argv[3] || DEFAULT_PACKAGE_PATH;

  var result = syncVersion(packagePath, manifestPath);

  if (result.code === 0) {
    console.log(result.message);
  } else {
    console.error(result.message);
  }

  return result.code;
}

// Export internals for testing; run main() only when executed directly
if (require.main !== module) {
  module.exports = { loadJSON, syncVersion };
} else {
  process.exit(main());
}
