# Time & Date Extension

A lightweight Chrome extension displaying the current time and date in a clean, light-themed popup interface.

## Installation

### Development (Unpacked)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the repository root directory
5. The extension icon will appear in the Chrome toolbar

Click the icon to open the popup and view the current time and date.

## Manifest Design

This extension uses a minimal Manifest V3 configuration intentionally:

- **No permissions requested** - The extension operates entirely offline using only the browser's built-in JavaScript Date API
- **No background service worker** - All functionality is contained within the popup, activated only when the user clicks the extension icon
- **No content scripts** - The extension does not inject code into web pages
- **No network access** - All assets are bundled; no external resources are loaded

This minimal approach ensures maximum privacy, security, and performance while complying with Chrome Web Store requirements.

Note: The `manifest.json` intentionally omits `permissions` and `host_permissions` entirely rather than setting them to empty arrays, as the absence of these keys conveys the same meaning with less configuration.

## Smoke Testing

To verify the extension loads correctly:

1. Follow the **Installation** steps above to load the unpacked extension
2. Verify **no manifest errors** appear in the Chrome extensions page
3. Confirm the **toolbar icon** displays (blue clock icon)
4. Click the icon and verify the **popup opens** showing the placeholder content

If all steps pass, the extension is properly configured and ready for further development.

## Manual Verification

To verify the popup scaffold is working correctly:

1. Load the extension in Chrome (see **Installation** above)
2. Open Chrome DevTools (F12) and switch to the **Console** tab
3. Click the extension icon in the toolbar
4. Verify in the Console:
   - **No errors** appear when the popup opens
   - The status shows "Popup loaded"
   - The timestamp displays the current date/time in your locale
5. Click the **Refresh** button
6. Verify:
   - The status changes to "Refreshed"
   - The timestamp updates to the current time
   - No console errors appear

If all verifications pass, the CSP-compliant popup scaffold is fully functional.

## Automated Checks

### CSP Compliance Check

To prevent CSP regressions, run the automated check:

```bash
npm run check:csp
```

This scans `popup.html` for:
- Inline `<script>` blocks (without `src` attribute)
- Inline event handlers (`onclick`, `onload`, etc.)

The script exits with code 0 on success, or 1 if violations are found.

## Project Structure

```
/
├── manifest.json          # Manifest V3 configuration
├── src/
│   └── popup/
│       ├── popup.html     # Popup UI markup
│       ├── popup.css      # Popup styles
│       └── popup.js       # Popup logic
└── assets/
    └── icons/             # Extension icons (16, 32, 48, 128 px)
```
