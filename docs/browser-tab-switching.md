# Browser tab switching

Review the shared rules first, then the browser adapters and their tests.

| File                                        | Responsibility                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `assets/browser-tab-references.swift`       | Retain AX tab objects, resolve their current position, and handle legacy rows without trusting a cached position.  |
| `assets/browser-accessibility.swift`        | Share AX attribute access and window discovery, retaining browser-specific scan limits and enhanced-UI settings.   |
| `assets/browser-helper-runtime.swift`       | Dispatch CLI/stdin commands and encode errors.                                                                     |
| `assets/window-focus.swift`                 | Restore, activate, raise and verify an identified window, retaining each caller's unhide/focused-attribute policy. |
| `src/helpers/browser-helper.ts`             | Own native processes, serialize requests, enforce timeouts, and reject expired session IDs.                        |
| `src/browsers/native.ts`                    | Share Chromium/WebKit list, decoding, focus and summary behavior, retaining each engine's window policy.           |
| `src/helpers/browser-tab-id.ts`             | Validate native window/tab IDs before sending focus requests.                                                      |
| `assets/{chromium,webkit,firefox}-ax.swift` | Discover browser-specific windows/tabs and perform focus actions. Each entry point calls the shared runtime.       |

## Identity and failure rules

- A retained tab ID refers to an AX object in one helper process. It does not encode a title, URL, or tab position.
- A reference must still belong to the requested window and the same application launch.
- Reordering or changing a tab's title does not select another object with matching content.
- Closed tabs, expired helper sessions, and missing controls fail instead of guessing a position.
- Legacy rows without a retained reference require a unique current title.
- WebKit's Apple Event fallback additionally requires an exact window ID. It is never used after a retained AX tab fails to activate.
- WebKit reads each tab group's `AXTabs`, including Orion's separate ordinary and pinned groups. Repeated AX objects are deduplicated by identity; separate tabs with the same title remain distinct.
- Opera uses the Chromium adapter with its own native policy: deeper tab-strip traversal for its extra AX application groups, and the `OpTb` scripting class for URL queries. Other Chromium browsers retain their existing traversal budget and `CrTb` class.
- Vivaldi traverses its known internal `window.html` UI once with a deeper budget. Nested web content stays excluded. If AXPress does not select a tab, its `AXDOMIdentifier` supplies the exact scripting tab ID. Focus locates that ID in live per-window tab lists, sets the current active index, and verifies both the scripting active ID and AX selection. Scripting window IDs are independent of native window IDs and are queried by identity, not window order or title.
- Native focus activates the app before raising its target window, then verifies the foreground PID and exact focused window ID. Firefox/Zen companion focus also activates its uniquely reconciled native window after selecting the browser tab.

## Compilation

`src/native-helper-catalog.ts` reads the canonical helper inventory in `assets/native-helpers.json`. Build, runtime selection and Firefox/Zen host installation share its source identity rules. `ensureNativeHelper` selects a helper by name; callers do not supply source-file lists. Packaged builds use verified universal binaries prepared by `npm run build:native`. Browser helpers include their entry point and all shared Swift files in the source hash. Source checkouts can compile missing helpers locally; source changes invalidate both bundled selection and the compiled cache. See [compatibility and release checks](compatibility.md).

## Verification

- `tests/tab-identity.test.ts` runs production list/focus functions with the production reference store. `tests/fixtures/tab-identity-*.swift` replace OS calls and contain the scenarios.
- `tests/browser-correctness.test.ts` covers legacy rows and WebKit's Apple Event fallback.
- `tests/browser-helper.test.ts` covers stdin request ordering and helper lifetime.
- `tests/swift-helpers.test.ts` covers shared-source cache invalidation and concurrent compilation.
- `tests/native-helper-catalog.test.ts` verifies build identities across runtime selection and Firefox/Zen installation.
- `tests/native-browser.test.ts` exercises both native browser engines through the browser client, including WebKit dialogs and focus failures.
- `tests/opera.test.ts` covers Opera discovery, browser navigation, background-URL search, and exact tab focus through the Chromium adapter, keeping other browsers out of Opera's native window scope.
- `tests/opera-native.test.ts` runs production list/focus handlers against Opera's deep AX hierarchy, including same-title tab reordering, and checks the browser-specific scripting class used by URL enrichment.
- `tests/webkit-tab-groups.test.ts` runs production tab discovery with separate ordinary/pinned groups, overlapping references, and single-group controls in both list and focus modes.
- `tests/native-browser-window-focus.test.ts` compiles the complete shared focus module against a fake OS, including its real asynchronous verifier. It covers activation restoring the previous key window, delayed foreground updates, caller policies, and failed focus. `tests/tab-identity.test.ts` verifies that each production entry point supplies its existing focus policy.
- `tests/vivaldi-native.test.ts` covers the internal UI boundary, retained references after reorder, and the scripting fallback for a no-op AXPress. Production Apple Event specifiers are checked with reordered windows/tabs, unavailable IDs, closed or ambiguous targets, and selection changing during activation.

Run `npm test`, `npm run build`, and `npm run lint`. Compile each browser entry point with all shared Swift files when checking native changes. Manual Raycast checks remain separate from automated checks.
