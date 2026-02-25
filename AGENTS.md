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
    /icons              # Extension icons (placeholder for later)
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
Story #6: Add Manifest V3 manifest.json (in progress)
- Repository scaffold complete (Story #5)
- manifest.json created at root with minimal MV3 fields
- Popup entry point and icon wiring pending

### Files Added/Modified
- `manifest.json` - Minimal MV3 manifest (no permissions, no service worker)
