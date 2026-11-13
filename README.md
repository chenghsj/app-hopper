# App Hopper

Find and switch between running apps, windows, and browser tabs from Raycast on macOS.

[![CI](https://github.com/chenghsj/app-hopper/actions/workflows/ci.yml/badge.svg)](https://github.com/chenghsj/app-hopper/actions/workflows/ci.yml)
[![Release notes](https://img.shields.io/badge/GitHub-Release_notes-181717?logo=github&logoColor=white)](https://github.com/chenghsj/app-hopper/releases/tag/companion-v1.0.1)
[![MIT License](https://img.shields.io/badge/License-MIT-green)](https://github.com/chenghsj/app-hopper/blob/main/LICENSE)

- Search running apps, window titles, and browser tabs in one place.
- Browse an app's windows or a browser's tabs and switch to the one you need.
- Find tabs by title or available URL, including background URLs with the Firefox/Zen companion.

## Usage

1. Open **App Hopper** in Raycast.
2. Allow **Raycast** in **System Settings → Privacy & Security → Accessibility**, then choose **Check Again**. Grant Automation access if macOS asks.
3. Type a name, title, or website domain. Select a result and press **Return** to browse its windows/tabs or switch to it.

## Browser Support

- **Chrome, Edge, Brave, Vivaldi, Safari, and Orion:** Built-in tab integrations.
- **Firefox and Zen:** Optional companion for live background tab URLs. See setup below.

Available tab information depends on the browser and its permissions.

### Firefox and Zen

Requires Firefox 142 or later, or a compatible Zen version.

1. In Raycast, run **Set up Firefox Integration** or **Set up Zen Integration**.
2. Choose **Enable Firefox Integration** or **Enable Zen Integration** and confirm installation in your browser.
3. Return to App Hopper, choose **Check Connection**, then refresh the tab list.

Install the same companion in each browser you use. Private-window access is optional and stays off by default.

Searching across all **Zen Spaces** requires a [separate local bridge](https://github.com/chenghsj/app-hopper/blob/main/docs/zen-integration.md#local-cross-workspace-bridge). It changes Zen's startup files, requires a restart, and may need reinstalling after a Zen update.

For troubleshooting, updates, and removal, see the [Firefox guide](https://github.com/chenghsj/app-hopper/blob/main/docs/firefox-integration.md) or [Zen guide](https://github.com/chenghsj/app-hopper/blob/main/docs/zen-integration.md).

## Development

See the [development guide](https://github.com/chenghsj/app-hopper/blob/main/docs/development.md) for source installation, requirements, and checks.

## License

[MIT](https://github.com/chenghsj/app-hopper/blob/main/LICENSE)
