# Development

Follow the [installation steps](../README.md#install-app-hopper) to load App Hopper into Raycast from source.

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

The generated `assets/native/` directory is excluded from Git. Edit the Swift sources and build scripts to change helpers.

## Browser companion

`companion/background.ts` and `companion/manifest.json` are shared by Firefox and Zen.

```sh
npm run build:companion
npm run package:companion
```

The build generates `dist/companion/extension/`; packaging creates the unsigned ZIP for Mozilla signing. The Firefox- and Zen-specific build/package commands are aliases. See [release automation](release-automation.md) for signing and publishing.

For Zen Console probes, run `npm run build:privileged` and use the generated JavaScript in `dist/privileged/`. Do not paste TypeScript source into Zen.

## Raycast distribution

Local builds use ad-hoc signing. For distribution, prepare Developer ID Application-signed helpers:

```sh
APP_HOPPER_SIGNING_IDENTITY='Developer ID Application: Your Name (TEAMID)' npm run package:native
npm run build -- --environment dist
npm run verify:native -- --release
```

The build preserves an unchanged, verified Developer ID package. Changing helper sources requires signing a new package.

The publish script checks source hashes, checksums, both architectures, Developer ID signatures, hardened runtime, and secure timestamps. Notarization is a separate step: notarize the actual helper archive and test a downloaded clean installation before publishing. See the [compatibility checklist](compatibility.md).

## CI

Pushes to `main` and pull requests run the build, typechecks, lint, regression tests, native verification, and companion/source packaging on macOS. CI artifacts are unsigned and are not production installers.

The manual **Sign and release companion** workflow defaults to build-only mode. See [release automation](release-automation.md) for signing, publishing, and recovery steps.
