/**
 * ESLint Configuration for Time & Date Chrome Extension
 *
 * Targets browser ES2021 for extension code with CSP-safe rules.
 * Node environment enabled for scripts/ directory.
 */

module.exports = {
  root: true,

  env: {
    browser: true,
    es2021: true,
  },

  globals: {
    chrome: 'readonly',
    Weather: 'readonly',
    AlarmUI: 'readonly',
  },

  extends: [
    'eslint:recommended',
    'prettier', // Disables ESLint rules that conflict with Prettier
  ],

  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'script',
  },

  rules: {
    // MV3/CSP safety rules - must be errors
    'no-eval': 'error',
    'no-implied-eval': 'error',

    // Baseline correctness rules
    'no-undef': 'error',
    'no-unused-vars': 'warn',
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
  },

  overrides: [
    {
      files: ['src/background/**/*.js'],
      env: {
        browser: false,
        serviceworker: true,
        es2021: true,
      },
      globals: {
        chrome: 'readonly',
        importScripts: 'readonly',
        self: 'readonly',
      },
    },
    {
      files: ['scripts/**/*.js'],
      env: {
        browser: false,
        node: true,
        es2021: true,
      },
    },
    {
      files: ['**/*.cjs'],
      env: {
        node: true,
        es2021: true,
      },
    },
    {
      files: ['tests/**/*.js'],
      env: {
        node: true,
        jest: true,
        es2021: true,
      },
    },
  ],

  ignorePatterns: ['node_modules/', 'schemas/'],
};
