#!/usr/bin/env node

/**
 * CSP Compliance Check Script
 * 
 * Scans popup.html for CSP violations:
 * - Inline <script> blocks (without src attribute)
 * - Inline event handlers (onclick, onload, etc.)
 * 
 * Exit codes:
 * 0 = All checks passed
 * 1 = CSP violations found
 */

const fs = require('fs');
const path = require('path');

const popupHtmlPath = path.join(__dirname, '..', 'src', 'popup', 'popup.html');

function checkCspCompliance() {
  let popupHtml;
  try {
    popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');
  } catch (error) {
    console.error(`Error reading ${popupHtmlPath}: ${error.message}`);
    process.exit(1);
  }

  const errors = [];

  // Check for inline <script> blocks (not external src)
  // Matches <script> or <script ...> but not <script src="...">
  const inlineScriptRegex = /<script(?![^>]*\bsrc=)[^>]*>/i;
  if (inlineScriptRegex.test(popupHtml)) {
    errors.push('Inline <script> block found (use external src instead)');
  }

  // Check for inline event handlers
  const eventHandlers = [
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
    'onmousemove', 'onmouseout', 'onkeydown', 'onkeypress', 'onkeyup',
    'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onselect',
    'onload', 'onunload', 'onerror', 'onresize', 'onscroll'
  ];

  eventHandlers.forEach(handler => {
    const regex = new RegExp(`\\s${handler}=`, 'i');
    if (regex.test(popupHtml)) {
      errors.push(`Inline ${handler} handler found (use addEventListener instead)`);
    }
  });

  return errors;
}

const errors = checkCspCompliance();

if (errors.length > 0) {
  console.error('CSP Compliance Check Failed:');
  errors.forEach(err => console.error(`  ✗ ${err}`));
  process.exit(1);
}

console.log('✓ CSP Compliance Check Passed');
process.exit(0);
