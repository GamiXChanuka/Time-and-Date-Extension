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
- `src/newtab/newtab.html` — New Tab alarm clock UI markup
- `src/newtab/newtab.css` — New Tab alarm clock styles
- `src/newtab/newtab.js` — New Tab alarm clock behavior
- `src/background/service-worker.js` — background service worker for alarm scheduling
- `src/alarm-storage.js` — alarm data model, validation, and chrome.storage.local persistence
- `scripts/check-csp.js` — CSP compliance validator
- `scripts/check-readiness.js` — MV3/CSP/offline readiness checker
- `scripts/validate-manifest.js` — MV3 manifest validator
- `scripts/check-version.js` — version match checker (package.json vs manifest.json)
- `scripts/sync-version.js` — syncs manifest.json version from package.json
- `tests/popup.helpers.test.js` — unit tests for formatting helpers
- `tests/popup.dom.test.js` — DOM-level tests for popup rendering
- `tests/check-readiness.test.js` — fixture-based tests for readiness checker
- `tests/popup.settings.test.js` — unit tests for settings persistence and validation
- `tests/check-version.test.js` — unit tests for version check and sync scripts
- `tests/alarm-storage.test.js` — unit tests for alarm data model and persistence
- `tests/service-worker.test.js` — unit tests for scheduling, recovery, and alarm firing
- `tests/fixtures/readiness/` — known-good and known-bad fixture files
- `assets/icons/` — extension icons (16/32/48/128px)

## Stable DOM IDs (do not rename)

- `timeValue` — `<time>` element for primary time display
- `dateValue` — `<time>` element for primary date display
- `secondaryTimeValue` — `<time>` element for secondary time display
- `secondaryDateValue` — `<time>` element for secondary date display
- `refreshBtn` — refresh button
- `dualClockToggle` — checkbox to enable/disable second clock
- `primaryTzSelect` — primary clock timezone selector
- `secondaryTzSelect` — secondary clock timezone selector
- `primaryClock` — primary clock container section
- `secondaryClock` — secondary clock container section (hidden by default)
- `status` — live region for screen reader announcements

### New Tab (newtab.html)

- `alarmFormSection` — alarm form container section
- `alarmFormHeading` — form heading (changes between "New Alarm" and "Edit Alarm")
- `alarmForm` — the `<form>` element
- `alarmTimeInput` — `<input type="time">` for alarm time
- `alarmLabelInput` — `<input type="text">` for optional label
- `alarmRepeatDays` — container for repeat day checkboxes
- `alarmEnabledToggle` — checkbox to enable/disable alarm on creation
- `alarmSaveBtn` — Save/Update button
- `alarmCancelBtn` — Cancel button (hidden in create mode)
- `alarmFormErrors` — validation error display (`aria-live="assertive"`)
- `alarmListSection` — alarm list container section
- `alarmList` — dynamic alarm card container
- `alarmEmptyState` — empty state message (hidden when alarms exist)

## Commands

- `npm run lint` — ESLint check
- `npm run lint:fix` — ESLint auto-fix
- `npm run format` — Prettier format all files
- `npm run format:check` — Prettier check formatting
- `npm run check:csp` — CSP compliance check
- `npm run check:readiness` — MV3/CSP/offline/manifest readiness checks
- `npm run validate:manifest` — manifest v3 schema validation
- `npm run version:check` — verify package.json and manifest.json versions match
- `npm run version:sync` — copy package.json version into manifest.json
- `npm run check` — run lint + format:check + validate:manifest + version:check
- `npm test` — run Jest unit tests

## Settings & Persistence (popup.js)

Settings are stored in `chrome.storage.local` under the key `dualClockSettings`. The data model:

| Field               | Type    | Default    | Notes                   |
| ------------------- | ------- | ---------- | ----------------------- |
| `schemaVersion`     | number  | `1`        | For future migration    |
| `dualClockEnabled`  | boolean | `false`    | Show/hide second clock  |
| `primaryTimeZone`   | string  | `"system"` | `"system"` or IANA zone |
| `secondaryTimeZone` | string  | `"UTC"`    | IANA zone identifier    |

Key functions (exported for testing):

- `TIMEZONE_OPTIONS` — curated list of ~12 IANA zones with friendly labels
- `DEFAULT_SETTINGS` — default settings object
- `validateTimeZone(tz)` — returns the zone if valid, `"system"` with console warning if invalid
- `sanitizeSettings(raw)` — merges raw stored data with defaults, validates zones
- `loadSettings()` — reads from `chrome.storage.local`, returns `Promise<settings>`; falls back to defaults when storage is unavailable
- `saveSettings(settings)` — writes to `chrome.storage.local`, returns `Promise`; no-op when storage is unavailable

The `"system"` sentinel means "use the browser's default timezone" (omit `timeZone` from `Intl.DateTimeFormat` options).

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
- **Typography:** `--font-family`, `--font-size-time/date/btn/small`, `--font-weight-time/date/btn`, `--line-height-time/date`
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
