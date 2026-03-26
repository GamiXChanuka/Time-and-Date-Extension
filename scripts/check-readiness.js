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

/** Directories excluded from extension source scanning (tooling, not shipped). */
const NON_SOURCE_DIRS = ['scripts', 'tests', 'schemas'];

/** Root-level files excluded from extension source scanning (config/generated). */
const NON_SOURCE_FILES = new Set([
  'package.json',
  'package-lock.json',
  '.eslintrc.cjs',
  '.prettierrc',
  '.gitignore',
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
]);

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

/**
 * Returns only extension source files (excludes tooling directories).
 * @param {string[]} files - Array of relative file paths
 * @returns {string[]} Source files only
 */
function sourceFiles(files) {
  return files.filter((f) => {
    const first = f.split(path.sep)[0];
    if (NON_SOURCE_DIRS.includes(first)) {
      return false;
    }
    if (NON_SOURCE_FILES.has(f)) {
      return false;
    }
    return true;
  });
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

/* ------------------------------------------------------------------ */
/*  CSP safety checks                                                  */
/* ------------------------------------------------------------------ */

/** Truncates a string for use as a snippet in violation messages. */
function snippet(text, maxLen) {
  if (typeof maxLen !== 'number') {
    maxLen = 60;
  }
  if (text.length <= maxLen) {
    return text;
  }
  return text.slice(0, maxLen) + '…';
}

/**
 * Runs CSP compliance checks across HTML and JS files.
 *
 * HTML rules:
 *  - No <script> tags without a src attribute (inline scripts).
 *  - No inline event handler attributes (on[a-z]+=).
 *
 * JS rules:
 *  - No eval( calls.
 *  - No new Function( calls.
 *
 * @param {string[]} files - Discovered project files
 * @returns {Array<object>} Array of violation objects
 */
function checkCSP(files) {
  var violations = [];
  var src = sourceFiles(files);

  // --- HTML checks ---
  var htmlFiles = filterByExt(src, '.html');
  htmlFiles.forEach(function (file) {
    var content = readFileSafe(file);
    if (!content) {
      return;
    }

    // Inline <script> tags (without src attribute)
    var inlineScripts = scanLines(content, /<script(?![^>]*\bsrc\s*=)[^>]*>/i);
    inlineScripts.forEach(function (m) {
      violations.push(
        createViolation(
          file,
          m.line,
          'Inline <script> without src attribute (use external file instead): ' + snippet(m.text)
        )
      );
    });

    // Inline event handler attributes (onclick=, onload=, etc.)
    var inlineHandlers = scanLines(content, /\bon[a-z]+=\s*/i);
    inlineHandlers.forEach(function (m) {
      violations.push(
        createViolation(
          file,
          m.line,
          'Inline event handler attribute (use addEventListener instead): ' + snippet(m.text)
        )
      );
    });
  });

  // --- JS checks ---
  var jsFiles = filterByExt(src, '.js');
  jsFiles.forEach(function (file) {
    var content = readFileSafe(file);
    if (!content) {
      return;
    }

    // eval( calls
    var evalCalls = scanLines(content, /\beval\s*\(/);
    evalCalls.forEach(function (m) {
      violations.push(
        createViolation(file, m.line, 'Use of eval( is not CSP-safe: ' + snippet(m.text))
      );
    });

    // new Function( calls
    var newFuncCalls = scanLines(content, /\bnew\s+Function\s*\(/);
    newFuncCalls.forEach(function (m) {
      violations.push(
        createViolation(file, m.line, 'Use of new Function( is not CSP-safe: ' + snippet(m.text))
      );
    });
  });

  return violations;
}

/* ------------------------------------------------------------------ */
/*  Offline-only checks                                                */
/* ------------------------------------------------------------------ */

/** Network API identifiers that must not appear in extension JS. */
var NETWORK_APIS = [
  { pattern: /\bfetch\s*\(/, label: 'fetch(' },
  { pattern: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest' },
  { pattern: /\bWebSocket\b/, label: 'WebSocket' },
  { pattern: /\bEventSource\b/, label: 'EventSource' },
];

/**
 * Pattern matching remote URLs (http:// or https://).
 * Lines containing chrome-extension:// are allowed and filtered out.
 */
var REMOTE_URL_PATTERN = /https?:\/\//;

/** Allowlisted URL schemes that should not trigger violations. */
var ALLOWED_SCHEME_PATTERN = /chrome-extension:\/\//;

/**
 * Pattern matching protocol-relative URLs in attribute or CSS contexts:
 *   src="//...", href="//...", url(//...)
 */
var PROTOCOL_RELATIVE_PATTERN = /(?:src|href)\s*=\s*["']\/\/|url\(\s*["']?\/\//i;

/**
 * Runs offline-only checks on extension source files.
 *
 * JS rules:
 *  - No fetch(, XMLHttpRequest, WebSocket, or EventSource usage.
 *
 * All text file rules:
 *  - No http:// or https:// remote references.
 *  - No protocol-relative // URLs in src/href/url() contexts.
 *  - chrome-extension:// URLs are explicitly allowed.
 *
 * @param {string[]} files - Discovered project files
 * @returns {Array<object>} Array of violation objects
 */
function checkOffline(files) {
  var violations = [];
  var src = sourceFiles(files);

  // --- JS network API checks ---
  var jsFiles = filterByExt(src, '.js');
  jsFiles.forEach(function (file) {
    var content = readFileSafe(file);
    if (!content) {
      return;
    }

    NETWORK_APIS.forEach(function (api) {
      var hits = scanLines(content, api.pattern);
      hits.forEach(function (m) {
        violations.push(
          createViolation(
            file,
            m.line,
            'Network API ' + api.label + ' violates offline-only policy: ' + snippet(m.text)
          )
        );
      });
    });
  });

  // --- Remote URL checks across all text source files ---
  var scannable = textFiles(src);
  scannable.forEach(function (file) {
    var content = readFileSafe(file);
    if (!content) {
      return;
    }

    // http:// and https:// references (skip allowed schemes)
    var remoteHits = scanLines(content, REMOTE_URL_PATTERN);
    remoteHits.forEach(function (m) {
      if (ALLOWED_SCHEME_PATTERN.test(m.text)) {
        return;
      }
      violations.push(
        createViolation(
          file,
          m.line,
          'Remote URL reference violates offline-only policy: ' + snippet(m.text)
        )
      );
    });

    // Protocol-relative // in URL contexts
    var protoRelHits = scanLines(content, PROTOCOL_RELATIVE_PATTERN);
    protoRelHits.forEach(function (m) {
      violations.push(
        createViolation(
          file,
          m.line,
          'Protocol-relative URL violates offline-only policy: ' + snippet(m.text)
        )
      );
    });
  });

  return violations;
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
