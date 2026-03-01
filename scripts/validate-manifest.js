#!/usr/bin/env node

/**
 * Manifest V3 Validation Script
 *
 * Validates manifest.json against the pinned local MV3 JSON schema using AJV.
 * Exits with code 0 on success, 1 on validation failure.
 * Runs fully offline with no network calls.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const MANIFEST_PATH = path.join(__dirname, '..', 'manifest.json');
const SCHEMA_PATH = path.join(__dirname, '..', 'schemas', 'manifest-v3-schema.json');

/**
 * Loads and parses a JSON file.
 * @param {string} filePath - Path to the JSON file
 * @returns {object} Parsed JSON content
 * @throws {Error} If file cannot be read or parsed
 */
function loadJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * Validates the manifest against the MV3 schema.
 * @param {object} manifest - The parsed manifest.json content
 * @param {object} schema - The parsed schema
 * @returns {object} Validation result with errors array
 */
function validateManifest(manifest, schema) {
  const ajv = new Ajv({ strict: false, allErrors: true, logger: false });
  addFormats(ajv);

  const validate = ajv.compile(schema);
  const isValid = validate(manifest);

  return {
    isValid,
    errors: validate.errors || [],
  };
}

/**
 * Performs additional MV3-specific validations beyond schema.
 * @param {object} manifest - The parsed manifest.json content
 * @returns {Array<string>} Array of error messages
 */
function validateMv3Requirements(manifest) {
  const errors = [];

  // Explicitly check for manifest_version: 3
  if (manifest.manifest_version !== 3) {
    errors.push(`manifest_version must be 3 (got: ${manifest.manifest_version})`);
  }

  return errors;
}

/**
 * Formats validation errors for user-friendly output.
 * @param {Array} schemaErrors - AJV validation errors
 * @param {Array<string>} mv3Errors - Additional MV3 requirement errors
 * @returns {string} Formatted error message
 */
function formatErrors(schemaErrors, mv3Errors) {
  const lines = ['Manifest validation failed:', ''];

  // Schema validation errors
  schemaErrors.forEach((error) => {
    const path = error.instancePath || '/';
    const message = error.message;
    lines.push(`  • ${path}: ${message}`);

    // Add helpful context for common errors
    if (error.params && error.params.additionalProperty) {
      lines.push(`    (unexpected property: ${error.params.additionalProperty})`);
    }
  });

  // MV3 requirement errors
  mv3Errors.forEach((error) => {
    lines.push(`  • ${error}`);
  });

  lines.push('');
  const totalErrors = schemaErrors.length + mv3Errors.length;
  lines.push(`${totalErrors} validation error${totalErrors === 1 ? '' : 's'} found.`);

  return lines.join('\n');
}

/**
 * Main validation function.
 * @returns {number} Exit code (0 for success, 1 for failure)
 */
function main() {
  // Check if manifest.json exists
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`Error: manifest.json not found at ${MANIFEST_PATH}`);
    return 1;
  }

  // Check if schema exists
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`Error: MV3 schema not found at ${SCHEMA_PATH}`);
    return 1;
  }

  let manifest;
  let schema;

  // Load manifest.json
  try {
    manifest = loadJson(MANIFEST_PATH);
  } catch (error) {
    console.error(`Error parsing manifest.json: ${error.message}`);
    return 1;
  }

  // Load MV3 schema
  try {
    schema = loadJson(SCHEMA_PATH);
  } catch (error) {
    console.error(`Error parsing MV3 schema: ${error.message}`);
    return 1;
  }

  // Validate against schema
  const schemaResult = validateManifest(manifest, schema);

  // Validate MV3-specific requirements
  const mv3Errors = validateMv3Requirements(manifest);

  // Determine overall validity
  const isValid = schemaResult.isValid && mv3Errors.length === 0;

  if (!isValid) {
    console.error(formatErrors(schemaResult.errors, mv3Errors));
    return 1;
  }

  console.log('✓ Manifest validation passed (MV3 compliant)');
  return 0;
}

// Run and exit with appropriate code
process.exit(main());
