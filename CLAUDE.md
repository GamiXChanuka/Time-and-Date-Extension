# CLAUDE.md

## Project Overview

Time & Date Extension — a lightweight Chrome MV3 extension that displays current time and date in a popup.

## Tech Stack

- Plain HTML, CSS, JavaScript (no frameworks, no build step)
- Chrome Manifest V3
- ESLint + Prettier for code quality
- AJV for manifest schema validation

## Key Paths

- `manifest.json` — extension entry point
- `src/popup/popup.html` — popup UI markup
- `src/popup/popup.css` — popup styles
- `src/popup/popup.js` — popup behavior
- `scripts/check-csp.js` — CSP compliance validator
- `scripts/validate-manifest.js` — MV3 manifest validator
- `assets/icons/` — extension icons (16/32/48/128px)

## Stable DOM IDs (do not rename)

- `timeValue` — `<time>` element for time display
- `dateValue` — `<time>` element for date display
- `refreshBtn` — refresh button
- `status` — live region for screen reader announcements

## Commands

- `npm run lint` — ESLint check
- `npm run lint:fix` — ESLint auto-fix
- `npm run format` — Prettier format all files
- `npm run format:check` — Prettier check formatting
- `npm run check:csp` — CSP compliance check
- `npm run validate:manifest` — manifest v3 schema validation
- `npm run check` — run lint + format:check + validate:manifest

## Code Guidelines

- No inline scripts, styles, or event handlers (CSP compliance)
- All JS in external `.js` files, all CSS in external `.css` files
- Use semantic HTML (`<main>`, `<time>`, `<button>`, ARIA attributes)
- Use `addEventListener` for all event wiring
- CSS uses Flexbox for layout; CSS custom properties for theming
- WCAG AA color contrast (≥ 4.5:1)
- Keep code simple — no frameworks or premature abstraction
