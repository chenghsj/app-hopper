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

Review the refresh and browser-window fixes in the following order. Each item pairs a behavior change with its regression tests. Files shared between items contain related changes; review the helper signatures with both their TypeScript callers and Swift implementations.

1. **Refresh cancellation.** Start with `window-data.ts`, `browsers/client.ts`, `helpers/browser-helper.ts`, `use-browser-snapshot.ts`, and `app-windows.tsx`, then follow the abort signal into native, AppleScript, and companion queries. Check that one cancelled caller cannot stop another caller's shared scan, obsolete work cannot publish, and an active helper response drains before the next command. Tests: `window-search-loading.test.ts`, `browser-loading.test.ts`, `browser-cancellation.test.ts`, `browser-snapshot-cancellation.test.ts`, `app-window-refresh.test.ts`, `applescript.test.ts`, and `browser-helper.test.ts`.
2. **Focus and discovery scope.** Read `browsers/firefox.ts`, `browsers/native.ts`, `windows.ts`, and Swift `macos-windows.swift` together. Focus uses the known target and validates its live owner; browser refresh filters owners before AX traversal. Root discovery still covers the desktop. In `helpers/browser-helper.ts`, focus may overtake queued scans but must wait for the active response. Tests: `native-browser.test.ts`, `firefox-companion-focus.test.ts`, `browser-scoped-discovery.test.ts`, `native-windows.test.ts`, `native-package.test.ts`, and `browser-helper.test.ts`.
3. **Bounded work and reuse.** Read `helpers/task-queue.ts` with `windows.ts`; Swift `browser-accessibility.swift`, `browser-query-budget.swift`, and `browser-tab-references.swift` with their engine callers; and `use-application-search.ts` with its input/rendering consumers. Check the two-query AX limit, shared URL deadline, retained tab identity, and cache invalidation on new observations. Tests: `ax-query-concurrency.test.ts`, `browser-accessibility.test.ts`, `browser-query-budget.test.ts`, `tab-reference-store.test.ts`, and `application-search.test.ts`.
4. **Firefox/Zen window identity.** Start with the pure matching rules in `browsers/firefox-reconciliation.ts`, then read the evidence producers in `browsers/firefox.ts`, `browsers/browser-process.ts`, `companion/background.ts`, and Swift `firefox-ax.swift`, `firefox-bridge.swift`, and `browser-process.swift`. Verify strong URL evidence before title-only candidates, and stable focus plus process generation before assigning identical windows. Companion 1.0.3 adds optional evidence with the existing permissions; old companions retain content matching. Tests: `firefox-reconciliation.test.ts`, `browser-window-focus-identity.test.ts`, `companion-window-identity.test.ts`, `native-browser-focus-identity.test.ts`, `browser-process.test.ts`, and `firefox-bridge.test.ts`.
5. **Unresolved window presentation.** Follow `possibleDuplicateOf` from reconciliation through `browsers/types.ts` and `browsers/snapshot.ts` into `browser-windows.tsx`, `app-row.ts`, and `search-results.ts`. Check that uncertain native observations stay reachable, do not inflate the confirmed count, and do not receive guessed Space identities. Tests: `ambiguous-browser-windows.test.ts` and `firefox-reconciliation.test.ts`.

TypeScript paths above are relative to `src/` except the repository-relative `companion/` paths. Swift paths are relative to `swift/app-hopper-native/Sources/`, and test paths to `tests/`. Native regression fixtures exercise production code; interactive Raycast acceptance and its limits are recorded separately in [compatibility](compatibility.md#current-evidence). Local build/test success does not establish a signed companion release; the 1.0.3 package remains an unsigned candidate.

#### Architecture ownership

- `src/app-hopper.tsx` renders the root list and handles runtime readiness. `use-application-search.ts` owns the query, arrangement, selection, live search ranking, held browsing positions, and refresh resets. `app-groups.ts` owns arrangements; `app-row.ts` resolves application row evidence into one navigation target.
- `app-list-item.tsx` and `search-result-item.tsx` render those targets. `window-actions.tsx` owns focus, missing-target recovery, and refresh actions.
- `app-window-evidence.ts` owns source coverage, browser navigation evidence, mixed native/AX search targets, and incomplete Space observations. Rows, arrangements and search retain their own presentation and ranking rules.
- `browsers/snapshot.ts` pairs browser data with native identities, keys scans, and retains valid enrichment. `use-browser-snapshot.ts` owns navigation seeding and live refreshes; `browsers/client.ts` shares in-flight scans across callers.
- `window-data.ts` owns cached startup, native-first publication, enrichment, completed-cache commits, and confirmed-window removal. `use-window-search.ts` uses Raycast's `usePromise` for loading, errors, retry, and request cancellation; the snapshot store checks its abort signal before publishing or committing. `use-stable-results.ts` retains selected identities and applies either held browsing positions or explicit search ranking.
- `browsers/firefox-reconciliation.ts` owns pure companion/AX matching. The Firefox adapter owns IPC and discovery.
- `swift/app-hopper-native/Sources/browser-accessibility.swift` owns shared browser window discovery. Browser entry points retain their engine policies and tab traversal.

### Root snapshots and search

`useWindowSearch` shows the cached snapshot immediately, then publishes fresh native windows before slower browser queries finish. Running apps, order, AX windows, browser counts, and tabs update as each query completes. Existing browser enrichment stays visible while native window/process identities remain valid; closed windows and restarted processes discard their old enrichment. A first launch without a cache leaves the loading view as soon as native windows arrive.

Without a query, selection holds the current app order and Space sections. During search, every update uses current relevance scores, then app name, title, URL, app identity, and native window identity to break ties. Retained tab UUIDs and incoming app recency do not determine search order. Applications always precede the Tabs and Windows section, including when a section arrives late. Search retains the selected target by exact identity when its rank changes; a selected live target that stops matching remains available until selection moves away. Unselected results that disappear or stop matching are removed automatically. A selected missing target stays as **No longer available**, with only **Refresh List** available, until selection moves away. This prevents Enter from silently switching to a different target without accumulating stale rows beside live matches. Changing the query, arrangement, or explicitly refreshing rebuilds the retained identities. AX result identities include the expected title and subrole because an AX index can be reused after closure; focus actions also retain their live target checks.

The arrangement dropdown stays mounted during search. Removing it for a nonempty query and recreating it on clear lets the native dropdown's initial selection overwrite the cached arrangement. During search it shows one **Relevance** item, retaining the cached arrangement as its controlled value and omitting the change handler. Clearing the search restores the four app arrangement options with the same selection value. This keeps the visible label aligned with search ranking without allowing native selection changes to overwrite the saved browsing preference.

### Cancellation and refresh

Only a completed load writes the persistent snapshot, once. Cancellation reaches native and AppleScript queries, stops later enrichment from starting, and closes pending companion socket reads. Cancelled browser scans leave the helper queue before execution. An active browser command keeps its session alive and drains its response so retained tab identities remain usable. A failed refresh keeps the latest visible data without persisting its partial snapshot. Optional query failures retain available data and are logged independently; cancellation is not logged as a query failure.

Removing a confirmed missing window invalidates the outstanding load before refreshing. Its late observations cannot restore the removed target. The cache removes that target from the last completed snapshot; a partial load never becomes the next launch's snapshot through this removal path.

### Browser snapshots

Browser navigation receives one browser snapshot containing its native windows and any known tabs, then revalidates them. The navigation query consumes that seed once; later refreshes rediscover native windows. Snapshot keys include the browser identity and native window state, so changed or mismatched seeds cannot reuse a different browser's layout. Simultaneous requests for the same browser and native snapshot share one in-flight scan. The request is removed when it succeeds or fails, so later refreshes read live data. Each browser has its own helper session and queue, including browsers that share an engine.

Each caller owns its wait on a shared browser scan. Cancelling the root refresh does not interrupt navigation that still needs that scan. Only the last departing caller cancels shared work; a new refresh can immediately create a fresh scan, and late cleanup from the cancelled scan cannot remove its replacement.

Browser window and nested tab navigation both supply Raycast's abort controller to their scans. Replacing a query or leaving either view releases that caller through the same shared-scan lifecycle. Search input handling and rendering reuse one result for the same query and observations; incoming app/tab data invalidates that result immediately. Only the most recent query is retained.

### Firefox/Zen window identity

Firefox/Zen retain address-bar evidence even when the native tab strip is hidden. Unique URL/tab matches resolve before title-only possibilities, so a confirmed URL match can remove ambiguity for another same-named window. A bare address can match Firefox's omitted HTTP(S) scheme and `www.` prefix; explicit URLs and conflicting paths, queries or fragments remain distinct. Native URLs do not fabricate a readable tab list.

The companion reports its actual active-tab URL independently of duplicate titles and tab order. Older companions can identify that URL only when exactly one tab has the active title. Otherwise native address-bar observations remain title-only candidates, so a same-title background tab cannot claim another window's native ID or Space through the stronger URL matching pass.

Companion 1.0.3 provides a last-focused window ID and focus revision independently of content. The native messaging host annotates replies with its verified Firefox/Zen parent's PID and launch timestamp. Native discovery captures the application's focused native window before and after scanning and checks its process generation again. After native discovery, a second companion status query must confirm the original focus revision, browser window ID and process generation. Only then can the focus observation identify an exact native window. Reconciliation resolves that identity before content candidates, allowing two identical-title, identical-URL windows to receive separate Space labels. Older companions remain compatible through content matching; more than two completely indistinguishable windows may still have unresolved candidates after the focused one is identified.

Native observations that remain ambiguous retain their possible companion matches. `partitionBrowserWindows` separates primary rows from overlapping observations without deleting either source. Overlapping observations are collapsed by default, remain inspectable, and do not count as confirmed extra windows. An uncertain summary contains a lower bound and `windowCountUncertain`; the application row displays **Multiple windows**. Once a possible companion match disappears, its native observation becomes a primary row again. Unique native/companion matches retain the existing Space and focus identity rules.

### Discovery and helper scheduling

Live browser refreshes scope native discovery to that browser's owner name and optional bundle path before querying Accessibility. CoreGraphics and Space metadata still come from the desktop snapshot, but unrelated applications receive no AX queries. Root discovery keeps its full-desktop behavior.

System Events AX fallback queries share a two-process limit across root loading and window subviews. Cancelled queued queries are removed before execution; an active query keeps its slot until its subprocess settles. Both ordinary and fallback app-window subviews cancel replaced or unmounted refreshes, ignore obsolete results and errors, and let only the current request update the root or loading indicator.

Within one browser session, focus requests run before scans that have not started. The active command completes first so stdout responses and retained tab references remain paired with that session. Browser window discovery sets per-element AX timeouts before the first window-ID lookup and stops remote-token probing after one second, retaining discovered windows. Firefox/Zen AX focus no longer refreshes every application's windows. Companion focus validates the known native window's current browser owner directly; when native identity is unavailable, it activates only a unique matching browser process.

### Runtime readiness

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
