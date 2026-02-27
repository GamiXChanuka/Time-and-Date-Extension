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
  /src
    /popup
      popup.html        # Valid HTML5, CSP-safe, semantic structure
      popup.css         # Popup styles (system fonts, no remote assets)
      popup.js          # CSP-compliant, uses addEventListener
  /assets
    /icons              # Extension icons (16, 32, 48, 128 px PNG)
```

## Technology Stack
- Plain HTML, CSS, JavaScript (no frameworks)
- Chrome Manifest V3
- No backend, no database, no external network calls

## Coding Standards
- **CSP Compliance:** No inline scripts/handlers; keep JS in separate files
- **HTML:** Use semantic elements (e.g., `<main>`, `<h1>`, `<time>` for date/time)
- **CSS:** Use system fonts or Flexbox/Grid; ensure accessibility
- **JS:** Use `addEventListener`; no `eval()` or dynamic code execution
- **Accessibility:** ARIA labels, keyboard focus, tab order for interactive elements
- **Git:** Meaningful commit messages, clean history

## Key Constraints
- Manifest V3 CSP: no inline scripts, no eval()
- Zero permissions unless chrome.storage needed later
- Work entirely offline
- Use browser's locale/timezone for formatting
- Keep codebase simple; avoid premature abstraction

## Current Status
Story #6: Add Manifest V3 manifest.json (COMPLETE)  
Story #7: Implement CSP-compliant extension popup scaffold (IN PROGRESS)

### Story #6 Acceptance Criteria (COMPLETE)
- ✓ `manifest.json` exists at repository root with `manifest_version: 3`
- ✓ Required metadata present (name, version, description)
- ✓ `action.default_popup` points to `src/popup/popup.html`
- ✓ Icon assets created (16/32/48/128 px) and wired in `icons` and `action.default_icon`
- ✓ No permissions requested (no `permissions` or `host_permissions` keys)
- ✓ No background service worker
- ✓ MV3/CSP compliant (no inline scripts, no eval)
- ✓ Smoke test documentation in README.md

### Story #7 Implementation Steps (IN PROGRESS)
1. ✓ **Step 1: Manifest alignment** - Verified `manifest.json` paths are correct (no changes needed)

### Files
- `manifest.json` - Complete MV3 manifest with popup and icons (no permissions, no service worker)
- `assets/icons/icon16.png` - Toolbar icon
- `assets/icons/icon32.png` - Toolbar HiDPI icon  
- `assets/icons/icon48.png` - Extension management icon
- `assets/icons/icon128.png` - Chrome Web Store icon
- `README.md` - Installation and smoke testing documentation
- `.gitignore` - Excludes virtual environment
- `src/popup/popup.html` - Popup HTML scaffold (CSP-compliant, semantic structure)
- `src/popup/popup.js` - Popup JavaScript (uses addEventListener)
- `src/popup/popup.css` - Popup styles (system fonts, minimal)
