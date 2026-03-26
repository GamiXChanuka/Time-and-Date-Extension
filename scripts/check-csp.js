#!/usr/bin/env node

/**
 * CSP Compliance Check Script
 *
 * Scans all HTML files under src/ for CSP violations:
 * - Inline <script> blocks (without src attribute)
 * - Inline event handlers (onclick, onload, etc.)
 *
 * Exit codes:
 * 0 = All checks passed
 * 1 = CSP violations found
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

/**
 * Recursively discovers all .html files under the given directory.
 * @param {string} dir - Directory to search
 * @returns {string[]} Absolute paths of .html files found
 */
function findHtmlFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findHtmlFiles(fullPath));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.html') {
      results.push(fullPath);
    }
  }
  return results;
}

/** Inline event handler attribute names to check for. */
const EVENT_HANDLERS = [
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmousemove',
  'onmouseout',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onfocus',
  'onblur',
  'onchange',
  'onsubmit',
  'onreset',
  'onselect',
  'onload',
  'onunload',
  'onerror',
  'onresize',
  'onscroll',
];

function checkCspCompliance() {
  let htmlFiles;
  try {
    htmlFiles = findHtmlFiles(srcDir);
  } catch (error) {
    console.error(`Error discovering HTML files in ${srcDir}: ${error.message}`);
    process.exit(1);
  }

  if (htmlFiles.length === 0) {
    console.error(`No HTML files found in ${srcDir}`);
    process.exit(1);
  }

  const errors = [];

  for (const htmlPath of htmlFiles) {
    const label = path.relative(path.join(__dirname, '..'), htmlPath);
    let content;
    try {
      content = fs.readFileSync(htmlPath, 'utf8');
    } catch (error) {
      errors.push(`Error reading ${label}: ${error.message}`);
      continue;
    }

    // Check for inline <script> blocks (not external src)
    const inlineScriptRegex = /<script(?![^>]*\bsrc=)[^>]*>/i;
    if (inlineScriptRegex.test(content)) {
      errors.push(`${label}: Inline <script> block found (use external src instead)`);
    }

    // Check for inline event handlers
    EVENT_HANDLERS.forEach((handler) => {
      const regex = new RegExp(`\\s${handler}=`, 'i');
      if (regex.test(content)) {
        errors.push(`${label}: Inline ${handler} handler found (use addEventListener instead)`);
      }
    });
  }

  return errors;
}

const errors = checkCspCompliance();

if (errors.length > 0) {
  console.error('CSP Compliance Check Failed:');
  errors.forEach((err) => console.error(`  ✗ ${err}`));
  process.exit(1);
}

console.log('✓ CSP Compliance Check Passed');
process.exit(0);
