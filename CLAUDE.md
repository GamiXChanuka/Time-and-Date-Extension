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
- `tests/popup.helpers.test.js` — unit tests for formatting helpers
- `tests/popup.dom.test.js` — DOM-level tests for popup rendering
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
- `npm test` — run Jest unit tests

## Formatting Helpers (popup.js)

Top-level functions exported for testing via conditional `module.exports`:

- `formatTime(date, locale)` — locale-aware time via cached `Intl.DateTimeFormat`
- `formatDate(date, locale)` — locale-aware date via cached `Intl.DateTimeFormat`
- `timeDateTimeAttr(date)` — ISO 8601 UTC timestamp (`date.toISOString()`)
- `toLocalISODate(date)` — local-calendar `YYYY-MM-DD` from local date components

Formatter instances are cached in `_formatterCache` keyed by locale and type. All helpers fall back to `toLocaleString` methods if `Intl` is unavailable.

## Popup Lifecycle Functions (popup.js)

Module-scoped functions inside the `typeof document` guard:

- `safeRender(now)` — updates time and date UI; accepts optional `Date` (defaults to `new Date()`); tolerates missing DOM elements
- `startTicker()` — starts 1-second auto-update interval; no-op if already running
- `stopTicker()` — clears interval and nulls `_intervalId`; idempotent
- `initPopup()` — queries DOM elements, calls `safeRender()` + `startTicker()`, wires event listeners; called on `DOMContentLoaded`

## CSS Design Tokens (popup.css)

`:root` custom properties defined at the top of `popup.css`:

- **Colors:** `--color-bg`, `--color-text`, `--color-muted`, `--color-border`, `--color-focus`
- **Button colors:** `--color-btn-bg`, `--color-btn-hover`, `--color-btn-active`
- **Typography:** `--font-family`, `--font-size-time/date/btn`, `--font-weight-time/date/btn`, `--line-height-time/date`
- **Spacing:** `--space-1` (0.25rem) through `--space-4` (1.5rem)
- **Radius:** `--radius`

All popup styles should reference these tokens rather than hard-coded values.

## Code Guidelines

- No inline scripts, styles, or event handlers (CSP compliance)
- All JS in external `.js` files, all CSS in external `.css` files
- Use semantic HTML (`<main>`, `<time>`, `<button>`, ARIA attributes)
- Use `addEventListener` for all event wiring
- CSS uses Flexbox for layout; CSS custom properties for theming
- WCAG AA color contrast (≥ 4.5:1)
- Keep code simple — no frameworks or premature abstraction
