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

/** Directories excluded from file discovery. */
const EXCLUDED_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage'];

/** Binary file extensions excluded from content scanning. */
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.gz',
  '.tar',
]);

/** Text file extensions eligible for content scanning. */
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.md']);

/* ------------------------------------------------------------------ */
/*  File discovery                                                     */
/* ------------------------------------------------------------------ */

/**
 * Discovers project files under the repo root, excluding ignored
 * directories and binary assets.
 * @returns {string[]} Relative file paths (forward-slash separated)
 */
function discoverFiles() {
  const entries = fs.readdirSync(ROOT, { withFileTypes: true, recursive: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const rel = path.relative(ROOT, path.join(entry.parentPath || entry.path, entry.name));
    const parts = rel.split(path.sep);

    // Skip files inside excluded directories
    if (parts.some((p) => EXCLUDED_DIRS.includes(p))) {
      continue;
    }

    // Skip binary assets
    if (BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    files.push(rel);
  }

  return files;
}

/**
 * Filters file paths by extension.
 * @param {string[]} files - Array of relative file paths
 * @param {string} ext - Extension including dot (e.g. '.html')
 * @returns {string[]} Matching file paths
 */
function filterByExt(files, ext) {
  return files.filter((f) => path.extname(f).toLowerCase() === ext);
}

/**
 * Returns only files eligible for text content scanning.
 * @param {string[]} files - Array of relative file paths
 * @returns {string[]} Files with scannable text extensions
 */
function textFiles(files) {
  return files.filter((f) => TEXT_EXTENSIONS.has(path.extname(f).toLowerCase()));
}

/* ------------------------------------------------------------------ */
/*  Scanning helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Reads a file as UTF-8. Returns null on failure instead of throwing.
 * @param {string} relPath - Relative path from repo root
 * @returns {string|null} File content or null
 */
function readFileSafe(relPath) {
  try {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Creates a violation object.
 * @param {string} file - Relative file path
 * @param {number|null} line - 1-based line number, or null
 * @param {string} message - Human-readable violation description
 * @returns {{file: string, line: number|null, message: string}}
 */
function createViolation(file, line, message) {
  return { file, line, message };
}

/**
 * Scans file content line-by-line against a regex pattern.
 * @param {string} content - File content
 * @param {RegExp} pattern - Pattern to test each line against
 * @returns {Array<{line: number, text: string}>} Matches with 1-based line numbers
 */
function scanLines(content, pattern) {
  const matches = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      matches.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return matches;
}

/* ------------------------------------------------------------------ */
/*  Violation formatting                                               */
/* ------------------------------------------------------------------ */

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
 * @param {string[]} files - Discovered project files
 * @returns {Array<object>} Array of violation objects
 */
function checkCSP(files) {
  void files;
  return [];
}

/**
 * Runs offline-only checks.
 * Stub — implemented in a later step.
 * @param {string[]} files - Discovered project files
 * @returns {Array<object>} Array of violation objects
 */
function checkOffline(files) {
  void files;
  return [];
}

/**
 * Runs manifest minimalism checks.
 * Stub — implemented in a later step.
 * @param {string[]} files - Discovered project files
 * @returns {Array<object>} Array of violation objects
 */
function checkManifest(files) {
  void files;
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

  // Discover project files
  const files = discoverFiles();

  // Run all check categories
  const categories = [
    { name: 'CSP safety', fn: checkCSP },
    { name: 'Offline-only', fn: checkOffline },
    { name: 'Manifest minimalism', fn: checkManifest },
  ];

  let totalViolations = 0;

  categories.forEach(({ name, fn }) => {
    const violations = fn(files);
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
