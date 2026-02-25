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
