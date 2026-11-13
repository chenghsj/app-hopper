# Development

## Install from source

Install [Raycast](https://www.raycast.com/), Node.js 24 or newer with npm, and Apple's Command Line Tools (`xcode-select --install`) or Xcode. Then run:

```sh
git clone https://github.com/chenghsj/app-hopper.git
cd app-hopper
npm ci
npm run dev
```

This builds the native helpers and loads App Hopper into Raycast for local development. Open **App Hopper** and follow the permission steps in the [README](../README.md#usage).

GitHub release downloads contain the Firefox/Zen companion, not a packaged Raycast extension.

## Project layout

| Directory    | Contents                                                                   |
| ------------ | -------------------------------------------------------------------------- |
| `src/`       | Raycast commands, window search/focus, and browser adapters.               |
| `companion/` | Shared Firefox/Zen companion and Zen workspace bridge.                     |
| `assets/`    | Extension icon, Swift helper sources, and companion release configuration. |
| `scripts/`   | Native builds, packaging, verification, and local setup tools.             |
| `tests/`     | Regression tests and native/browser fixtures.                              |
| `docs/`      | Setup, compatibility, and release guides.                                  |

## Local checks

```sh
npm test
npm run typecheck
npm run build -- --environment dist
npm run lint
npm run verify:native
```

`npm run dev` and `npm run build` automatically prepare native helpers. They compile Apple Silicon and Intel slices, combine them into universal binaries, sign them for local use, and generate `assets/native/manifest.json`. Unchanged helpers are verified and reused.

`assets/native/` is the helper snapshot included for Store review and distribution. Keep its binaries and manifest in Git so a Store build does not depend on npm lifecycle hooks or a compiler on the user's Mac. Edit Swift sources, run `npm run build:native`, and commit the updated snapshot together. See [native helper provenance](native-helpers.md).

## Browser companion

`companion/background.ts` and `companion/manifest.json` are shared by Firefox and Zen.

```sh
npm run build:companion
npm run package:companion
```

The build generates `dist/companion/extension/`; packaging creates the unsigned ZIP for Mozilla signing. The Firefox- and Zen-specific build/package commands are aliases. See [release automation](release-automation.md) for signing and publishing.

For Zen Console probes, run `npm run build:privileged` and use the generated JavaScript in `dist/privileged/`. Do not paste TypeScript source into Zen.

## Raycast distribution

Store submissions use source-built universal helpers with verified code signatures. Developer ID is optional for this submission flow. After updating code and taking Store screenshots in `metadata/`, run:

```sh
npm run build
npm run typecheck
npm run lint
npm test
```

Add the changed source, helpers, manifest, listing files, and screenshots to Git. Then run `npm run verify:store`, commit the changes, and run `npm run publish`. The CLI creates a PR for Raycast review; approval and a downloaded clean-install check remain separate from local verification.

### Optional Developer ID distribution

For a separately Developer ID-signed package, use your own certificate:

```sh
APP_HOPPER_SIGNING_IDENTITY='Developer ID Application: Your Name (TEAMID)' npm run package:native
npm run build -- --environment dist
npm run verify:native -- --release
```

The build preserves an unchanged, verified Developer ID package. Changing helper sources requires signing a new package.

`verify:native -- --release` additionally checks Developer ID signatures, hardened runtime, and secure timestamps. It does not perform notarization. See the [compatibility checklist](compatibility.md) before claiming notarized distribution or downloaded-artifact Gatekeeper acceptance.

## CI

Pushes to `main` and pull requests run the build, typechecks, lint, regression tests, native verification, and companion/source packaging on macOS. CI artifacts are unsigned and are not production installers.

The manual **Sign and release companion** workflow defaults to build-only mode. See [release automation](release-automation.md) for signing, publishing, and recovery steps.
