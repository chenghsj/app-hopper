# App Hopper

Find and switch between running apps, windows, and browser tabs from Raycast on macOS.

[![CI](https://github.com/chenghsj/app-hopper/actions/workflows/ci.yml/badge.svg)](https://github.com/chenghsj/app-hopper/actions/workflows/ci.yml)
[![Release notes](https://img.shields.io/badge/GitHub-Release_notes-181717?logo=github&logoColor=white)](https://github.com/chenghsj/app-hopper/releases/tag/companion-v1.0.1)
[![MIT License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

- Search running apps and drill down into their windows and tabs.
- Use the optional Firefox/Zen companion to search live background tab URLs.
- Keep using app/window switching without the companion.

## Install App Hopper

You need macOS, [Raycast](https://www.raycast.com/), Node.js 24 or newer with npm, and Apple's Command Line Tools or Xcode. Install the Command Line Tools with `xcode-select --install` if needed.

```sh
git clone https://github.com/chenghsj/app-hopper.git
cd app-hopper
npm ci
npm run dev
```

This builds the native helpers and loads App Hopper into Raycast for local development.
GitHub release downloads contain the browser companion only; install the Raycast extension from source using these steps.

1. Open **App Hopper** in Raycast.
2. Allow **Raycast** in **System Settings → Privacy & Security → Accessibility**, then choose **Check Again**.
3. Grant Automation access if macOS asks, then search for an app, window, or tab.

## Connect Firefox or Zen

The optional companion requires Firefox/Zen with Firefox WebExtension API support for version 142 or later.

1. In Raycast, run **Set up Firefox Integration** or **Set up Zen Integration**.
2. Choose **Enable Firefox Integration** or **Enable Zen Integration**.
3. Confirm the add-on installation in your browser.
4. Return to App Hopper, choose **Check Connection**, then refresh the tab list.

Both browsers use the same Mozilla-signed companion. Install it in each browser you use.
Private-window access stays off unless you allow it in the browser.

**Disconnected?** Run the setup command, choose **Repair Local Helper**, then click the companion's toolbar button or restart the browser and check again.

**Zen Spaces:** Searching across all Spaces needs a [separate local bridge](docs/zen-integration.md#local-cross-workspace-bridge). It changes Zen's AutoConfig startup files and requires a restart; browser updates may require reinstalling it. The companion alone lists tabs exposed by Zen's standard API.

**Upgrading from the old Zen companion?** Follow the [migration steps](docs/zen-integration.md#migrating-from-the-old-zen-only-development-companion) before installing the shared companion.

## Guides

| Guide                                            | What you'll find                                    |
| ------------------------------------------------ | --------------------------------------------------- |
| [Firefox setup](docs/firefox-integration.md)     | Installation, updates, permissions, and removal.    |
| [Zen setup](docs/zen-integration.md)             | Companion setup, all-Spaces bridge, and migration.  |
| [Development](docs/development.md)               | Project layout, local checks, and native packaging. |
| [Release automation](docs/release-automation.md) | CI, Mozilla signing, and companion releases.        |
| [Compatibility](docs/compatibility.md)           | Tested environments and remaining release checks.   |

Companion 1.0.1: [source ZIP](https://github.com/chenghsj/app-hopper/releases/download/companion-v1.0.1/app-hopper-companion-1.0.1-source.zip) · [SHA-256 checksums](https://github.com/chenghsj/app-hopper/releases/download/companion-v1.0.1/SHA256SUMS).

## License

[MIT](LICENSE)
