#!/usr/bin/env node

/**
 * Readiness Checker for Chrome Web Store Compliance
 *
 * Performs static analysis to verify the extension meets:
 * - MV3 Content Security Policy (CSP) safety
 * - Offline-only operation (no network APIs or remote URLs)
 * - Manifest minimalism (zero permissions, allowed keys only)
 *
 * Exits with code 0 when all checks pass, 1 when violations are found.
 * Runs fully offline with no network calls.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');

/**
 * Prints a violation with file path and optional line number.
 * @param {object} v - Violation object
 * @param {string} v.file - Relative file path
 * @param {number|null} [v.line] - Line number (1-based)
 * @param {string} v.message - Description of the violation
 * @returns {string} Formatted violation string
 */
function formatViolation(v) {
  const loc = v.line ? `${v.file}:${v.line}` : v.file;
  return `    ✗ ${loc}: ${v.message}`;
}

/**
 * Prints the result summary for a single check category.
 * @param {string} name - Category name
 * @param {Array<object>} violations - Array of violation objects
 */
function printCategoryResult(name, violations) {
  if (violations.length === 0) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(
      `  ✗ ${name} (${violations.length} violation${violations.length === 1 ? '' : 's'})`
    );
    violations.forEach((v) => {
      console.error(formatViolation(v));
    });
  }
}

/**
 * Checks that all required files exist before running checks.
 * @returns {Array<string>} Array of error messages for missing files
 */
function checkRequiredFiles() {
  const missing = [];

  if (!fs.existsSync(MANIFEST_PATH)) {
    missing.push(`manifest.json not found at ${MANIFEST_PATH}`);
  }

  return missing;
}

/**
 * Runs CSP compliance checks.
 * Stub — implemented in a later step.
 * @returns {Array<object>} Array of violation objects
 */
function checkCSP() {
  return [];
}

/**
 * Runs offline-only checks.
 * Stub — implemented in a later step.
 * @returns {Array<object>} Array of violation objects
 */
function checkOffline() {
  return [];
}

/**
 * Runs manifest minimalism checks.
 * Stub — implemented in a later step.
 * @returns {Array<object>} Array of violation objects
 */
function checkManifest() {
  return [];
}

/**
 * Main entry point. Orchestrates all readiness checks.
 * @returns {number} Exit code (0 = pass, 1 = fail)
 */
function main() {
  console.log('Readiness check\n');

  // Fail fast if required files are missing
  const missingFiles = checkRequiredFiles();
  if (missingFiles.length > 0) {
    missingFiles.forEach((msg) => {
      console.error(`Error: ${msg}`);
    });
    return 1;
  }

  // Run all check categories
  const categories = [
    { name: 'CSP safety', fn: checkCSP },
    { name: 'Offline-only', fn: checkOffline },
    { name: 'Manifest minimalism', fn: checkManifest },
  ];

  let totalViolations = 0;

  categories.forEach(({ name, fn }) => {
    const violations = fn();
    totalViolations += violations.length;
    printCategoryResult(name, violations);
  });

  // Final summary
  console.log('');
  if (totalViolations === 0) {
    console.log(`All ${categories.length} checks passed.`);
    return 0;
  }

  console.error(
    `${totalViolations} violation${totalViolations === 1 ? '' : 's'} found across ${categories.length} checks.`
  );
  return 1;
}

process.exit(main());
