# App Hopper

A macOS Raycast extension for finding and switching between running applications, windows, and browser tabs.

## Downloads

[App Hopper Companion 1.0.1 release](https://github.com/chenghsj/app-hopper/releases/tag/companion-v1.0.1)

| File                                                                                                                                    | Purpose                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Signed companion XPI](https://github.com/chenghsj/app-hopper/releases/download/companion-v1.0.1/app-hopper-companion-1.0.1.xpi)        | Install the same Mozilla-signed add-on in Firefox and Zen.                  |
| [Companion source ZIP](https://github.com/chenghsj/app-hopper/releases/download/companion-v1.0.1/app-hopper-companion-1.0.1-source.zip) | TypeScript source, pinned dependencies and reproducible build instructions. |
| [SHA256SUMS](https://github.com/chenghsj/app-hopper/releases/download/companion-v1.0.1/SHA256SUMS)                                      | Checksums for the signed XPI and source archive.                            |

**This repository contains the complete App Hopper project**: the Raycast extension, shared Firefox/Zen companion, native macOS helpers, tests, build tools and documentation. The release downloads above contain the browser companion, not a packaged Raycast extension. Install App Hopper from source below before enabling the companion.

## Install App Hopper from source

Install [Raycast](https://www.raycast.com/) and Node.js 24 or newer with npm. Install Apple's Command Line Tools (`xcode-select --install`) or Xcode for building the native helpers, then run:

```sh
git clone https://github.com/chenghsj/app-hopper.git
cd app-hopper
npm ci
npm run dev
```

`npm run dev` builds the native helpers and loads the extension into Raycast for local development. Open **App Hopper** in Raycast, grant the requested permissions, then enable the browser companion if needed. This source installation is separate from a Raycast Store release.

## Requirements

- macOS and Raycast with App Hopper installed. Firefox/Zen must support Firefox WebExtension APIs version 142 or later.
- Allow **Raycast** in **System Settings → Privacy & Security → Accessibility**. App Hopper offers **Open Accessibility Settings** and **Check Again** when access is missing.
- If macOS requests Automation access to System Events or a browser, grant it to Raycast. Permissions are specific to each user's Mac.

## Install the companion

1. In Raycast, run **Set up Firefox Integration** or **Set up Zen Integration** for the browser you use.
2. Choose **Enable Firefox Integration** or **Enable Zen Integration**. App Hopper downloads the signed XPI, checks its version, identity and SHA-256, prepares the local native helper, and opens it in the selected browser.
3. Confirm the browser's installation prompt. The browser verifies Mozilla's signature.
4. Return to App Hopper, choose **Check Connection**, then refresh the tab list.

Firefox and Zen use **one companion package and one add-on ID**: `app-hopper-firefox@chenghsj`. Install that same XPI in each browser you use. Their native helpers and local connections remain separate so tabs and focus requests stay with the selected browser.

For manual installation, prepare the local helper from App Hopper first. Then open the browser's Add-ons Manager, choose **Install Add-on From File**, and select the signed XPI from Downloads. A normal signed installation persists across browser restarts; temporary loading through `about:debugging` is for development only.

## Zen Spaces

The companion reads tab URLs even when Zen's sidebar is hidden. Searching and switching across **all Zen Spaces** additionally requires the separate local workspace bridge.

The bridge is **not included in the XPI or installed by Enable Zen Integration**. The repository includes a source-based bridge installer; see [Zen integration](docs/zen-integration.md#local-cross-workspace-bridge). The currently tested bridge is an advanced local setup that changes Zen's AutoConfig startup files and requires a restart; Zen updates may require reinstalling it. Without the bridge, the companion is limited to tabs exposed by Zen's standard API.

## Migrate from the old Zen companion

Remove the old **App Hopper Zen Companion** (`app-hopper-zen@chenghsj`) and any temporary companion before installing the shared signed XPI. Prepare/repair the Zen local helper in the updated App Hopper. An existing local workspace bridge must also target the shared add-on ID.

Existing Firefox companion installations retain their original ID and can upgrade to version 1.0.1.

## Connection and permissions

- If the companion is installed but disconnected, run the corresponding setup command in Raycast, choose **Repair Local Helper**, then click the companion toolbar button or restart that browser and check the connection again.
- The add-on requests `tabs` and `nativeMessaging` to exchange tab titles, URLs and activation requests with the local App Hopper helper. Private-window access stays off unless explicitly granted in the browser.
- App/window switching and Accessibility-based browser support remain available without the companion. Hidden tab lists are reported as unavailable rather than assigned an invented count.

## Project layout

| Directory    | Contents                                                                  |
| ------------ | ------------------------------------------------------------------------- |
| `src/`       | Raycast commands, window search/focus and browser adapters.               |
| `companion/` | Shared browser companion and Zen-specific workspace bridge.               |
| `assets/`    | Extension icon, Swift helper sources and companion release configuration. |
| `scripts/`   | Native builds, packaging, verification and local setup tools.             |
| `tests/`     | Regression tests and native/browser fixtures.                             |
| `docs/`      | Browser integration, compatibility and distribution documentation.        |

## Development

Install Apple's Command Line Tools or Xcode, select a working developer directory, then run:

```sh
npm ci
npm run dev
```

`predev` and `prebuild` compile both Apple Silicon and Intel helper slices, combine them into universal binaries, sign them for local use, and prepare `assets/native/manifest.json`. Unchanged helpers are verified and reused. The generated directory is excluded from Git; the Swift sources and build scripts are the source of truth.

```sh
npm test
npm run typecheck
npm run build -- --environment dist
npm run lint
npm run verify:native
```

## Distribution

Local builds use **ad-hoc signing**, which is not Developer ID distribution approval. Before publishing, prepare Developer ID Application-signed helpers:

```sh
APP_HOPPER_SIGNING_IDENTITY='Developer ID Application: Your Name (TEAMID)' npm run package:native
npm run build -- --environment dist
npm run verify:native -- --release
```

The build preserves an unchanged verified Developer ID package. Changing helper sources requires signing a new package. The publish script refuses helpers that do not have matching sources/checksums, both architectures, valid Developer ID signatures, hardened runtime, and secure timestamps.

Developer ID signing and notarization are separate release steps. The verifier does **not** claim notarization or Gatekeeper acceptance. Complete Apple's notarization process for the actual helper archive and test a downloaded clean installation before publishing; do not treat an ad-hoc local build as a release artifact. See the [compatibility checklist](docs/compatibility.md).

## CI and companion releases

Pushes to `main` and pull requests run macOS CI: native/Raycast build, strict typechecks, lint, regression tests, helper verification, and companion/source packaging. CI artifacts are unsigned and are not production installers.

The **Sign and release companion** workflow is manual. Its default build-only mode does not contact Mozilla. To release a new companion, increase `companion/manifest.json` on `main`, open the workflow under Actions, and disable **Build only**. For a real signing test without publishing, also disable **Publish GitHub Release**. It uses the `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` repository Secrets to submit an unlisted version and its matching source archive. See [release automation](docs/release-automation.md) for the complete flow and recovery steps.
