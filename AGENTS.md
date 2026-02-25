# Time & Date Extension - Agent Reference

## Project Overview
A lightweight Manifest V3 Chrome extension displaying current time and date in a clean, light-themed popup interface.

## Repository Structure
```
/ (repo root)
  package.json          # npm config with lint/format/test scripts
  package-lock.json     # npm lockfile
  README.md             # User documentation
  AGENTS.md             # This file
  /src
    /popup
      popup.html        # Valid HTML5, CSP-safe
      popup.css         # Popup styles (Flexbox/Grid, no remote assets)
      popup.js          # Uses addEventListener, no eval/inline handlers
  /assets
    /icons              # Extension icons (16, 32, 48, 128px)
```

## Technology Stack
- Plain HTML, CSS, JavaScript (no frameworks)
- Chrome Manifest V3
- No backend, no database, no external network calls

## Coding Standards
- **CSP Compliance:** No inline scripts/handlers; keep JS in separate files
- **HTML:** Use semantic elements (e.g., `<main>`, `<time>` for date/time)
- **CSS:** Use Flexbox or Grid; ensure accessibility (contrast, font sizes)
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
Story #5: Initializing repository scaffold (directories, package.json, popup placeholders)
