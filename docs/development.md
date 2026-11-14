# Development

## Install from source

Install [Raycast](https://www.raycast.com/), Node.js 24 or newer with npm, and Xcode 16.3 or later. Then run:

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

Run `npm run preview:loading` to open a persistent loading-screen preview in Raycast. Confirm **Run** if asked, and press **Esc** to leave it.

`npm run dev` and `npm run build` use Raycast's Swift integration to compile `swift/app-hopper-native/`. Commit the Swift package, its sources and `Package.resolved`; generated executables and build caches stay ignored. Runtime never invokes a compiler. See [native helpers](native-helpers.md).

### Review map

- `src/app-hopper.tsx` renders the root list and handles runtime readiness. `use-application-search.ts` owns the application search query, arrangement, selection, held result positions, and refresh resets. `app-groups.ts` owns arrangements; `app-row.ts` resolves application row evidence into one navigation target.
- `app-list-item.tsx` and `search-result-item.tsx` render those targets. `window-actions.tsx` owns focus, missing-target recovery, and refresh actions.
- `app-window-evidence.ts` owns source coverage, browser navigation evidence, mixed native/AX search targets, and incomplete Space observations. Rows, arrangements and search retain their own presentation and ranking rules.
- `browsers/snapshot.ts` pairs browser data with native identities, keys scans, and retains valid enrichment. `use-browser-snapshot.ts` owns navigation seeding and live refreshes; `browsers/client.ts` shares in-flight scans across callers.
- `window-data.ts` owns cached startup, native-first publication, enrichment, completed-cache commits, and confirmed-window removal. `use-window-search.ts` uses Raycast's `usePromise` for loading, errors, retry, and request cancellation; the snapshot store checks its abort signal before publishing or committing. `use-stable-results.ts` commits appended row positions after rendering.
- `browsers/firefox-reconciliation.ts` owns pure companion/AX matching. The Firefox adapter owns IPC and discovery.
- `swift/app-hopper-native/Sources/browser-accessibility.swift` owns shared browser window discovery. Browser entry points retain their engine policies and tab traversal.

### Startup snapshots

`useWindowSearch` shows the cached snapshot immediately, then publishes fresh native windows before slower browser queries finish. Running apps, order, AX windows, browser counts, and tabs update as each query completes. Existing browser enrichment stays visible while native window/process identities remain valid; closed windows and restarted processes discard their old enrichment. A first launch without a cache leaves the loading view as soon as native windows arrive.

Selection or typing holds the current row positions and Space sections. Later matches append within their section, and held rows keep receiving current data by identity. A missing target stays in place as **No longer available**, with only **Refresh List** available. Changing the query, arrangement, or explicitly refreshing rebuilds the layout. AX result identities include the expected title and subrole because an AX index can be reused after closure; focus actions also retain their live target checks.

The arrangement dropdown stays mounted during search. Removing it for a nonempty query and recreating it on clear lets the native dropdown's initial selection overwrite the cached arrangement. Keeping it visible preserves the selected arrangement and its saved preference. Changing it during search retains the query; its application grouping applies after the query is cleared.

Only a completed load writes the persistent snapshot, once. Cancellation ignores later updates, and a failed refresh keeps the latest visible data without persisting its partial snapshot. Optional query failures retain available data and are logged independently.

Removing a confirmed missing window invalidates the outstanding load before refreshing. Its late observations cannot restore the removed target. The cache removes that target from the last completed snapshot; a partial load never becomes the next launch's snapshot through this removal path.

Browser navigation receives one browser snapshot containing its native windows and any known tabs, then revalidates them. The navigation query consumes that seed once; later refreshes rediscover native windows. Snapshot keys include the browser identity and native window state, so changed or mismatched seeds cannot reuse a different browser's layout. Simultaneous requests for the same browser and native snapshot share one in-flight scan. The request is removed when it succeeds or fails, so later refreshes read live data. Each browser has its own helper session and queue, including browsers that share an engine.

Cached rows can render during the per-launch prerequisite check, with their actions disabled. Window discovery and row actions become available only after the check succeeds; missing permissions still open the setup view. This avoids flashing an empty loading screen on each launch without reusing a previous permission decision.

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

Add the changed TypeScript/Swift source, Swift dependency lockfile, listing files, and screenshots to Git. Run `npm run prepare:store` to verify and export the current contents of tracked files to `dist/store/`. Check that directory before publishing. New files must be added to Git first.

The export contains the Raycast source, runtime assets, screenshots, build/lint configuration, the Swift package and its dependency lockfile. Companion sources, tests, release/signing tools, agent instructions, the per-extension license file, and other development documents remain in this source repository. Links to omitted guides point here. The exported manifest retains only working extension/build commands, and its lockfile is pruned offline to remove companion-only development dependencies without changing the source lockfile.

When ready, commit the changes and run `npm run publish`. This prepares the directory again and runs the Raycast CLI from `dist/store/`, so the submitted files use the same exclusions. The CLI creates a PR for Raycast review; approval and a downloaded clean-install check remain separate from local verification. `prepare:store` alone does not publish or open a PR.

## CI

Pushes to `main` and pull requests run the build, typechecks, lint, regression tests, native verification, and companion/source packaging on macOS. CI artifacts are unsigned and are not production installers.

The manual **Sign and release companion** workflow defaults to build-only mode. See [release automation](release-automation.md) for signing, publishing, and recovery steps.
