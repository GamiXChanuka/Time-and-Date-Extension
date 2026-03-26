#!/usr/bin/env node

/**
 * Version Check Script
 *
 * Compares package.json.version (authoritative) against manifest.json.version.
 * Exits with code 0 when versions match, 1 when they differ or on error.
 * Runs fully offline with no network calls.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_PACKAGE_PATH = path.join(__dirname, '..', 'package.json');
const DEFAULT_MANIFEST_PATH = path.join(__dirname, '..', 'manifest.json');

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
 * Checks whether package.json.version matches manifest.json.version.
 * @param {string} packagePath - Path to package.json
 * @param {string} manifestPath - Path to manifest.json
 * @returns {{ code: number, message: string }}
 */
function checkVersion(packagePath, manifestPath) {
  var pkg = loadJSON(packagePath);
  if (pkg.error) {
    return { code: 1, message: 'Error: ' + pkg.error };
  }

  var manifest = loadJSON(manifestPath);
  if (manifest.error) {
    return { code: 1, message: 'Error: ' + manifest.error };
  }

  var pkgVersion = pkg.data.version;
  if (typeof pkgVersion !== 'string') {
    return {
      code: 1,
      message: 'Error: ' + packagePath + " does not contain a 'version' field",
    };
  }

  var manifestVersion = manifest.data.version;
  if (typeof manifestVersion !== 'string') {
    return {
      code: 1,
      message:
        'Version mismatch: ' +
        packagePath +
        " has '" +
        pkgVersion +
        "' but " +
        manifestPath +
        " has no 'version' field",
    };
  }

  if (pkgVersion !== manifestVersion) {
    return {
      code: 1,
      message:
        'Version mismatch: ' +
        packagePath +
        " has '" +
        pkgVersion +
        "' but " +
        manifestPath +
        " has '" +
        manifestVersion +
        "'",
    };
  }

  return {
    code: 0,
    message:
      "\u2713 Versions match: '" +
      pkgVersion +
      "' (" +
      packagePath +
      ' \u2194 ' +
      manifestPath +
      ')',
  };
}

/**
 * Main entry point. Parses optional CLI arguments and runs the check.
 * Usage: check-version.js [manifest-path] [package-path]
 * @returns {number} Exit code (0 = match, 1 = mismatch or error)
 */
function main() {
  var manifestPath = process.argv[2] || DEFAULT_MANIFEST_PATH;
  var packagePath = process.argv[3] || DEFAULT_PACKAGE_PATH;

  var result = checkVersion(packagePath, manifestPath);

  if (result.code === 0) {
    console.log(result.message);
  } else {
    console.error(result.message);
  }

  return result.code;
}

// Export internals for testing; run main() only when executed directly
if (require.main !== module) {
  module.exports = { loadJSON, checkVersion };
} else {
  process.exit(main());
}
