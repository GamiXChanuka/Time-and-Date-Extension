# Time & Date Extension - Agent Reference

## Project Overview

A lightweight Manifest V3 Chrome extension displaying current time and date in a clean, light-themed popup interface.

## Repository Structure

```
/ (repo root)
  manifest.json         # Chrome Manifest V3 (Story #6)
  package.json          # npm config with lint/format/test scripts
  package-lock.json     # npm lockfile
  README.md             # User documentation
  AGENTS.md             # This file
  .gitignore            # Excludes node_modules, .venv
  .eslintrc.cjs         # ESLint configuration
  .prettierrc           # Prettier configuration
  /src
    /popup
      popup.html        # Valid HTML5, CSP-safe, semantic structure
      popup.css         # Popup styles (system fonts, no remote assets)
      popup.js          # CSP-compliant, uses addEventListener
  /assets
    /icons              # Extension icons (16, 32, 48, 128 px PNG)
  /scripts
    check-csp.js        # CSP compliance validation script
    validate-manifest.js # MV3 manifest validation (AJV-based)
  /schemas
    manifest-v3-schema.json  # Pinned MV3 schema for offline validation
```

## Technology Stack

- Plain HTML, CSS, JavaScript (no frameworks)
- Chrome Manifest V3
- ESLint 8.x + Prettier 3 + AJV 8 (code quality tooling)
- No backend, no database, no external network calls

## Coding Standards

- **CSP Compliance:** No inline scripts/handlers; keep JS in separate files
- **HTML:** Use semantic elements (e.g., `<main>`, `<h1>`, `<time>` for date/time)
- **CSS:** Use system fonts or Flexbox/Grid; ensure accessibility
- **JS:** Use `addEventListener`; no `eval()` or dynamic code execution
- **Linting:** ESLint with browser ES2021, no-eval, no-implied-eval rules
- **Formatting:** Prettier for JS/JSON/CSS/HTML/MD (2-space, semicolons, single quotes)
- **Accessibility:** ARIA labels, keyboard focus, tab order for interactive elements
- **Git:** Meaningful commit messages, clean history

## npm Scripts

| Script                      | Purpose                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| `npm run lint`              | Lint all JS files with ESLint                                    |
| `npm run lint:fix`          | Auto-fix ESLint issues                                           |
| `npm run format`            | Format all files with Prettier                                   |
| `npm run format:check`      | Check formatting (CI-friendly)                                   |
| `npm run validate:manifest` | Validate manifest.json against MV3 schema                        |
| `npm run check`             | Run lint + format:check + validate:manifest (aggregate CI check) |
| `npm run check:csp`         | Check CSP compliance in popup.html                               |

## Key Constraints

- Manifest V3 CSP: no inline scripts, no eval()
- Zero permissions unless chrome.storage needed later
- Work entirely offline
- Use browser's locale/timezone for formatting
- Keep codebase simple; avoid premature abstraction

## Current Status

Story #6: Add Manifest V3 manifest.json (COMPLETE)  
Story #7: Implement CSP-compliant extension popup scaffold (COMPLETE)  
Story #8: Set up baseline code quality tooling (IN PROGRESS - Steps 1-5 Complete)

### Story #6 Acceptance Criteria (COMPLETE)

- ✓ `manifest.json` exists at repository root with `manifest_version: 3`
- ✓ Required metadata present (name, version, description)
- ✓ `action.default_popup` points to `src/popup/popup.html`
- ✓ Icon assets created (16/32/48/128 px) and wired in `icons` and `action.default_icon`
- ✓ No permissions requested (no `permissions` or `host_permissions` keys)
- ✓ No background service worker
- ✓ MV3/CSP compliant (no inline scripts, no eval)
- ✓ Smoke test documentation in README.md

### Story #7 Implementation Steps (COMPLETE)

1. ✓ **Step 1: Manifest alignment** - Verified `manifest.json` paths are correct
2. ✓ **Step 2: Popup HTML markup** - Implemented semantic elements with CSP compliance
3. ✓ **Step 3: Popup JS behavior** - Implemented addEventListener wiring, timestamp display, Refresh button
4. ✓ **Step 4: Popup CSS styling** - Added accessible styling with Flexbox layout
5. ✓ **Step 5: Regression protection** - Added automated CSP check script

### Story #8 Implementation Steps (IN PROGRESS)

1. ✓ **Dependencies** - ESLint 8.x, Prettier 3, AJV 8, eslint-config-prettier installed
2. ✓ **Config files** - .eslintrc.cjs (browser ES2021, CSP-safe), .prettierrc (2-space, semicolons)
3. ✓ **Validation script** - validate-manifest.js with AJV, offline MV3 schema check
4. ✓ **npm scripts** - lint, lint:fix, format, format:check, validate:manifest, check (aggregate)
5. ✓ **Documentation** - Code Quality section in README.md with scripts and workflows

### Files

- `manifest.json` - Complete MV3 manifest with popup and icons
- `assets/icons/icon{16,32,48,128}.png` - Extension icons
- `README.md` - Installation, smoke testing, and verification docs
- `.gitignore` - Excludes node_modules and virtual environments
- `.eslintrc.cjs` - ESLint config with CSP-safe rules (no-eval, no-implied-eval)
- `.prettierrc` - Prettier config for consistent formatting
- `src/popup/popup.html` - Popup HTML scaffold (CSP-compliant)
- `src/popup/popup.js` - Popup JavaScript (uses addEventListener)
- `src/popup/popup.css` - Popup styles (system fonts, minimal)
- `scripts/check-csp.js` - Automated CSP compliance check
- `scripts/validate-manifest.js` - Offline MV3 manifest validation (AJV-based)
- `schemas/manifest-v3-schema.json` - Pinned MV3 schema for offline validation
