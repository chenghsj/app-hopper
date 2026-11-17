# Compatibility and release checks

## Current evidence

| Environment               | Evidence                                                                                 | Remaining acceptance                                              |
| ------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| macOS 27.2, Apple Silicon | Local Raycast workflows and automated regression suite                                   | Clean user account and downloaded release installation            |
| Intel helper slices       | Cross-compilation, universal-binary architecture checks, code signature validation       | Execution on an Intel Mac                                         |
| Other macOS versions      | Helpers compile with a macOS 13.0 deployment target and guard newer activation APIs      | Full window/tab and permission workflows on each claimed version  |
| Firefox companion 1.0.1   | Live search/focus, restart, moved/closed-tab rejection, repair, removal/re-enable passed | Clean-account first installation; version upgrade                 |
| Zen companion 1.0.1       | Installed XPI hash matches pin; live URL search and restart/reconnection passed          | Clean-account first installation, version upgrade, repair/removal |
| Zen workspace bridge      | Zen 1.24.1b scratch-profile and daily-profile restart/cross-workspace switching passed   | Repeat after Zen updates; private-window acceptance               |
| Windows / Linux           | Not supported                                                                            | No support claimed                                                |

Raycast's own system requirement also applies and can be newer than the helpers' deployment target. Do not advertise a minimum supported macOS version based solely on a compiler target.

### Companion 1.0.3 release and shared refresh hooks (2026-11-18)

Companion 1.0.3 was Mozilla-signed and published by the [release workflow](https://github.com/chenghsj/app-hopper/actions/runs/44141412888), and its URL/version/SHA-256 are pinned in App Hopper. Anonymous downloads of the signed XPI and reviewer source ZIP matched `SHA256SUMS`; the XPI also matched the source manifest, built background JavaScript and expected signature metadata. The release lookup now uses the existing workflow token, with regressions for authenticated lookup and refusing an existing release. Browser installation remains the cryptographic verifier; a signed-version upgrade was not performed.

Ordinary and AX window refreshes now use Raycast's `usePromise` for loading, cancellation, obsolete-result rejection and failure toasts. The initial scan waits for Refresh, while subsequent revalidation retains the loading indicator. Tests execute the installed Raycast hook for both views, including app-identity changes, late results/errors, repeated refreshes and Back. All 327 tests, complete typechecks, lint, distribution build, universal native verification and Store verification passed under Node 24.16.0. The publisher-only source revision also passed [cloud CI](https://github.com/chenghsj/app-hopper/actions/runs/44141329063).

The final manual window-refresh check was blocked by the Mac being locked. The earlier browser Refresh/Back check below remains evidence for that browser workflow; it does not establish live acceptance of the new ordinary/AX window hook or the signed companion upgrade.

### Review follow-up (2026-11-18)

Companion 1.0.3 now reports its actual active-tab URL, including the pending URL fallback. Reconciliation uses this value instead of treating any same-title background tab as active-window evidence. With older companions, duplicate active-title tabs remain title-only possibilities; an unreadable private window cannot claim a companion window's native ID or Space through a matching background URL. Nested **Show Tabs** queries now pass Raycast's abort signal through to the shared browser scan on refresh replacement and Back.

All 321 regressions, typecheck, Raycast build, lint, universal native verification, Store verification, companion/source packaging and companion lint passed. Nine added regressions cover active/pending URL reporting, absent active selection, both browser adapters with new and legacy companions, and nested refresh cancellation through the installed Raycast promise lifecycle. The original multi-window pairing reproduction also passes with another independently verified focused window present.

In the rebuilt local Raycast extension, Chrome's existing window list opened its nested tab page. Refresh followed immediately by Back restored the parent window list without an error. The installed source map matched the changed browser-view and reconciliation sources. No browser tabs were opened, closed or selected. The new active-URL metadata is covered by production companion/adapter regressions; its signed browser upgrade remains untested. Companion 1.0.3 remains an unsigned candidate, and the production download stays pinned to 1.0.1.

### Search ordering (2026-11-17)

Root search now uses current relevance scores and fixed app/title/URL tie-breakers for both initial and progressively updated results. Replaced native tab references return to their ranked positions, and incoming app recency does not decide equal-score search order. The selected target follows its exact identity when its position changes; a selected missing target remains disabled until selection moves away. App browsing without a query still retains its arrangement and held Space sections.

All 250 regressions, build, typecheck, and lint passed. Regressions cover reference replacement, reversed app/tab input order, late browser matches, late higher-scoring results, rescoring renamed targets, consistent section order, and exact selected actions after reordering. In the rebuilt local Raycast development extension, `shortcut` returned the same ordered five rows before and after switching to the Code window and reopening App Hopper, and again after Refresh List. No browser tabs were created or closed for this check.

The search-label follow-up displays **Relevance** during a nonempty query and restores the saved app arrangement on clear. The dropdown remains mounted with its selection value preserved. All 44 related regressions, build, typecheck, and lint passed. Native Raycast checks passed **Recently Used**, **Name A–Z**, **Browsers & Apps**, and **By Space** → search → clear, with each original label and grouping restored. The original Recently Used preference was restored, and the final search displayed Relevance.

### Native tab focus latency (2026-11-17)

A local Chrome check measured 2,053 ms from the native adapter's focus entry to helper completion: 1,978 ms was spent refreshing every application's window snapshot, followed by 75 ms for the browser helper. Sending the same window/tab target directly to its browser helper reduced that path to 56 ms in the paired check. The helper still resolves the live browser window, checks the retained tab identity, and verifies the focused window. These measurements exclude Raycast input/rendering and are a single local comparison, not a benchmark across browsers or Space transitions.

Both Chromium and WebKit now skip that global scan during focus. Deferred-query regressions for both engines fail before the change and pass afterward, proving an unrelated blocked window query no longer delays the focus request. All 248 regressions, build, typecheck, and lint passed. In the final rebuilt Raycast development extension, URL search and selection activated the exact Chrome options tab; the browser's selected-tab state and address bar confirmed the target. Temporary timing instrumentation was removed. Firefox/Zen adapters were not changed by this optimization.

### Firefox/Zen focus and helper scheduling (2026-11-17)

Firefox/Zen AX focus now also skips desktop discovery. Companion focus raises the known native window only after validating its current browser owner; without a native window ID, it activates only a uniquely matching running browser process. Within each browser helper, focus precedes scans that have not started while the active command and retained tab references remain in their original session. Browser window objects receive a 150 ms timeout before their first ID lookup, and remote-token probing stops after one second while retaining discovered windows.

All 258 regressions, build, typecheck, lint, and native package verification passed. Added checks cover blocked desktop discovery, companion owner validation, focus priority without overlapping responses, queued requests after helper exit, and bounded AX discovery. In the rebuilt local Raycast extension, selecting Firefox's existing add-on manager tab showed `about:addons` as the selected tab and address. Selecting the existing Zen release-notes result marked Space 1 brought its release-notes window forward. The installed helper's SHA-256 matched the rebuilt package, and the installed JavaScript contained the new focus queue. These checks confirm the observed switching workflows; no end-to-end latency benchmark was collected.

### Refresh cancellation and fresh snapshot timing (2026-11-17)

Replacing or cancelling a root refresh now aborts its one-shot native/AppleScript queries, prevents later enrichment, closes companion reads, and removes browser scans that have not started. Shared scans remain available to other callers. An active browser command drains its response in the same process rather than expiring retained tab references.

All 267 regressions, build, typecheck, and lint passed. Added tests cover native subprocess termination, cancellation before enrichment and windowless-app discovery, cancelled queue entries, active-response draining, companion socket cleanup, shared consumers, and immediate retry without stale cleanup removing the replacement scan.

Three local Raycast measurements covered 25 windows across 18 processes, including 20 direct AX window references. From `loadWindowData` entry, native discovery took 1,918–2,109 ms, the first fresh snapshot arrived at 1,918–2,109 ms, and complete enrichment finished at 2,813–3,337 ms. These measure fresh data, excluding cached rendering, setup checks, and Raycast input/rendering. The principal wait before a fresh snapshot is still native discovery. Temporary timing code was removed after measurement, with the source checksum restored exactly before rebuilding.

### Browser navigation, URL budgets and large tab lists (2026-11-17)

Browser subviews now cancel superseded or unmounted queries through Raycast's abort controller. Search input and rendering reuse one computed result for unchanged observations, with a single-entry cache invalidated by incoming data. Native tab registration uses a reverse AX identity index while retaining window/process/launch checks, hash-collision verification and capacity retirement. Chromium/WebKit URL queries share a two-second budget across browser processes and fallback paths; AppleScript checks the monotonic deadline before each application query instead of restarting a fixed timeout for every command.

All 275 regressions, build, typecheck, lint and native package verification passed. New checks cover the real Raycast query lifecycle, one search per input, fresh-data invalidation, identity comparison growth over 2,000 tabs, hash collisions and retired references, shared native query budgets, valid fallback compilation, and the actual AppleScript monotonic clock and expiry error. In rebuilt Raycast, Safari retained all four existing tabs and URLs after live refresh. Repeated child refresh followed by Back remained usable, URL filtering selected the exact existing target, and selected-tab/address-bar observations confirmed switching in both directions. The original Safari selection was restored. The final installed helper checksum matched the rebuilt package. These checks establish behavior; no new end-to-end speed benchmark is claimed.

### Scoped browser refresh and bounded AX fallback queries (2026-11-17)

Browser refresh and direct Chromium/WebKit/Gecko adapter discovery now pass the application owner name and optional bundle path into native discovery. The helper filters owners before Accessibility traversal, retaining the existing native window eligibility rules. Root discovery still reads the full desktop. System Events AX fallback queries share a limit of two active subprocesses; cancelled queued work never starts, and active work retains its slot until it settles. Both ordinary and AX fallback window subviews cancel superseded or unmounted refreshes, suppress obsolete results and errors, and prevent obsolete requests from updating the root or clearing the current loading indicator.

All 291 regressions, typecheck, build, lint and native package verification passed. Tests reproduced the original global discovery arguments, simultaneous AX process burst, late response overwrites and missing Back cancellation before the fixes. The production native discovery harness checks owner-name and bundle-path filtering before AX calls, including rejection of a mismatched bundle path. The installed native helper checksum matches the universal rebuilt package.

After the Mac was unlocked, the rebuilt local Raycast extension retained Safari's four tabs and URLs through repeated refreshes. Chrome retained three windows with 28, 7 and 18 tabs; drilling into the seven-tab window and refreshing preserved its rows and URLs. Code's three-window page remained complete through repeated refreshes. Refresh followed immediately by Back from Safari, Chrome and Code returned to a usable root list without a failure message. No tabs were opened, closed or selected. AX fallback races and the two-process limit remain verified by regression tests; this interactive check did not force an AX fallback page or measure simultaneous subprocesses. No new end-to-end latency measurement is claimed.

### Process and stable-focus identity for identical windows (2026-11-17)

Companion 1.0.3 adds content-independent last-focused identity and a focus revision, using the existing tabs/nativeMessaging permissions. The native host validates its browser parent and supplies PID plus launch time. Native discovery requires the process generation and focused window to remain stable across scanning. A post-scan companion status check must confirm the original last-focused window, revision and process before reconciliation uses this evidence. Identical titles, URLs and geometry no longer prevent two windows from pairing when this identity is available. Additional indistinguishable windows can remain unresolved; the code still requires a unique assignment.

All 311 regressions, typecheck, Raycast build, companion build/package, lint and universal native verification passed. New tests reproduce two fully identical windows in reversed native order, then verify correct native IDs and Space labels. They reject focus changes, restarted/reused PIDs and foreign native generations; execute production native list code under focus/process races; and confirm companion identity queries never move, resize or focus windows.

After explicit user approval, Companion 1.0.3 was temporarily loaded in Zen with the existing permissions. Live production-adapter reads confirmed that two windows with identical titles, active URLs and complete four-tab content sets mapped to distinct native window IDs in **Space 1** and **Space 5**. Raycast displayed exactly those two windows and their Space labels, retained them after Refresh List, and selected the Space 5 test tab in the verified native window. The temporary fullscreen window and test tabs were removed, and the local server was stopped. A final live read matched the original native window, Space, three tab IDs, title/URL hashes and active selection against the pre-test baseline. The companion remains a temporary development installation. The unsigned candidate is `dist/companion/app-hopper-companion-1.0.3.zip`; no release or Mozilla signing was performed.

### Hidden-tab URL evidence and actual Space pairing (2026-11-17)

The presentation fix below did not establish native window identities. Native Firefox/Zen discovery was also discarding a readable address-bar URL whenever the tab strip was hidden. The helper now retains that URL separately from the unavailable tab list. Reconciliation resolves unique URL/tab evidence before weak title-only possibilities, then resolves remaining unique pairs against unclaimed native windows. The observed Zen address **youtube.com** now matches its companion URL **https://www.youtube.com/**. Scheme-less display trimming is supported without ignoring explicit scheme/host differences or conflating different paths, queries and fragments. Completely indistinguishable observations still remain unresolved.

All 302 regressions, typecheck, build, lint and native package verification passed. Regressions cover hidden-strip URL retention, reversed native order, two same-title windows, one known URL resolving a second title-only window, trimmed `www.` collisions and explicit host conflicts. In Raycast, two windows titled **YouTube** displayed their separate native Spaces: the original three-tab window in **Space 1** and a temporary one-tab local test window in a fullscreen **Space 5**. Refresh retained exactly those two rows and Space labels, with no collapsed duplicate group. Selecting the Space 5 tab focused the exact local test URL. This establishes pairing when both native windows are observed; a separate desktop CLI snapshot omitted the inactive fullscreen test window, so complete inactive-fullscreen enumeration remains outside this pairing correction.

Two temporary windows and the local test server were removed after acceptance. The final live companion/native check contained the original single window, the same three original tab IDs and URL hashes, native window ID and Space 1. The installed native helper checksum matched the final universal build. Existing companion installation and native messaging framing were unchanged.

### Ambiguous Firefox/Zen window presentation (2026-11-17)

The reported Zen scene was reproduced in the installed Raycast development extension: two companion windows each provided three tabs with the same **YouTube** window title, while two unreadable native observations appeared as extra windows with Space labels. The root incorrectly displayed **4 windows**. Reconciliation now records these possible overlaps while preserving every source observation. The main browser list keeps the two tab-bearing windows and collapses alternate observations under **Other Detected Windows**. The root displays **Multiple windows** instead of an exact count. Native identity and Space metadata still require a unique match; unknown native-only windows remain directly visible.

All 297 regressions, typecheck, build, lint and native verification passed. New tests reproduced duplicate main rows, inflated counts and extra root-search summaries, then verified collapsed access, retained native identities, native-only coverage and restoration of primary rows after companion candidates disappear. In the rebuilt Raycast extension, the original two three-tab YouTube rows remained through refresh. Expanding showed the two native observations under an explicit uncertainty heading, and hiding them restored the collapsed row. Browser search and root search for **Zen YouTube** showed the two companion tabs without extra native summaries. No tabs were opened, closed or selected for this check.

### Local browser acceptance, 2026-11-13

On macOS 27.2.1 (Apple Silicon), the working checkout based on `e6e2c2b`, including the uncommitted helper/browser refactors and single-command setup, was built and opened in Raycast. The current regression suite passed 153 tests; build, typecheck, lint, and `verify:store` passed. These results apply to this local working tree, not the committed Store preparation alone.

- Firefox 160.0: Raycast displayed **Connected — companion 1.0.1**. A unique fragment URL on a background test tab was searchable, and switching selected that tab among two identically titled test tabs. A normal quit/relaunch reconnected companion 1.0.1 without reinstallation. Firefox opened its home page on launch; **Restore Previous Session** restored the original two tabs. Their URL set matched the pre-restart snapshot.
- Zen 1.24.1b: the installed, active companion was version 1.0.1 with `signedState: 2`; its XPI SHA-256 matched `assets/companion-integration.json`. Normal quit/relaunch reconnected automatically and preserved the original four-tab URL set. A test tab in the existing second Zen workspace was searchable from the first workspace. App Hopper selected it and then switched back to a first-workspace tab in the reverse direction. This used the installed bridge and daily-use profile after restart, without loading a temporary add-on or Console script.
- All test tabs were closed. Final local IPC queries confirmed zero test URLs and the same original URL sets in both browsers. URL snapshots were compared using hashes; browsing URLs and profile data are not included in this record.

Firefox's profile files were protected by macOS privacy controls, so its installed XPI checksum was not independently read. Its live version and restart persistence were verified. See the follow-up below for additional Firefox checks. Clean-account first installation, version upgrades, private windows, and installation without developer tools remain separate release checks.

### Firefox follow-up, 2026-11-13

- Two normal Firefox windows contained identically titled **Example Domain** tabs with distinct fragment URLs. Searching each unique URL and selecting its result activated the correct window/tab.
- With an App Hopper result cached, Firefox's **Move Tab → Move to New Window** moved the target. The old result failed with **Firefox tab moved. Refresh the list.** Refreshing exposed the new target. Closing the target then made the cached result fail with **Invalid tab ID**; refreshing removed it and showed **No Results**.
- **Repair Local Helper** completed with **Local helper is ready**, and the existing connection remained available. This exercised repair of a healthy installation, not a deliberately corrupted helper.
- **Remove Local Integration** changed the UI to **Not enabled**. Read-only filesystem checks confirmed removal of the Firefox native manifest, bridge executables, and companion download cache. Three unrelated Firefox helper files retained their checksums, and Zen companion 1.0.1 remained connected.
- **Enable Firefox Integration** downloaded the pinned 1.0.1 XPI, restored the native host, and opened Firefox's installation confirmation. Firefox displayed **App Hopper Companion installed** after confirmation; private-window access stayed off. **Check Connection** returned **Connected — companion 1.0.1**. The downloaded XPI SHA-256 matched the release pin. This was reinstallation in the existing profile, not a clean-account first install or version upgrade.
- All temporary tabs/windows and the XPI handoff tab were closed. Final IPC snapshots showed Firefox's original one window/two tabs and Zen's one window/four tabs, with URL sets matching the pre-test snapshots. The unrelated helper files were still unchanged.

The follow-up exposed duplicate search rows when two windows each contained one identically titled tab: title-only native/companion reconciliation retained AX fallback rows. The URL-based fix below addresses that case when AX provides distinguishing URLs.

### Same-title window reconciliation fix, 2026-11-13

Reconciliation now uses known AX tab URLs in addition to the complete tab-title signature and requires a unique match in both directions. HTTP(S) schemes omitted by Firefox's address bar are handled while explicit schemes, paths, queries, and fragments remain significant. Companion session/tab IDs still control focus; native Space metadata is copied only after a unique match. Conflicting known URLs reject a match. Missing URLs remain unknown, so genuinely ambiguous or unconnected windows stay visible.

The new regression reproduced four rows for two same-title windows before the fix and two afterward, for both Firefox and Zen. Coverage also checks reversed native order, conflicting URLs, incomplete URL evidence, duplicate tab-title multiplicity, and ambiguous windows that must remain separate. All 159 tests, build, typecheck, lint, and Store verification passed.

In the rebuilt Raycast extension, two new Firefox windows each held one **Example Domain** tab at distinct `app-hopper-url-fix` fragment URLs. Searching the shared marker showed exactly two results, one per URL, and selecting the first activated its exact URL. Both test windows were removed afterward; the live companion again reported the original one window/two tabs with no test URLs. Zen shares this matching logic and has regression coverage; this fix was manually verified in Firefox.

### Opera acceptance, 2026-11-14

Opera 140.0 was checked in the rebuilt local Raycast extension on macOS 27.2.1 (Apple Silicon). App Hopper displayed all three tabs in one normal Opera window, found a background tab by its unique URL fragment, and selecting **Switch to Tab** changed Opera's selected tab and address bar to that exact URL. Both temporary test tabs were closed afterward, leaving the original Speed Dial tab.

Opera's AX tab strip requires deeper traversal than Chrome's, and its scripting tab class is `OpTb`. Native regressions cover both differences and exact retained-tab focus after same-title tabs reorder. URL enrichment continues to omit ambiguous same-title matches. Opera workspaces, private windows, multiple windows, and other Opera/macOS versions still require manual acceptance.

### Orion acceptance, 2026-11-14

Orion 1.1.3 (152) exposes ordinary and pinned tabs in separate AX tab groups. The helper previously read `AXTabs` from only the first group, omitting pinned tabs. Discovery now reads every group and deduplicates repeated AX objects without merging distinct same-title tabs.

In the rebuilt local Raycast extension, a window showing three ordinary tabs and one pinned tab changed from three listed tabs to four. Refresh showed both Orion windows with the correct counts. A background test tab was found by its unique URL fragment, and selecting it activated that exact URL. Selecting the restored pinned row activated the pinned tab in the chosen window. Both temporary tabs were closed and the original selection restored; the final native snapshot contained the original two windows and five tabs, with no test URL remaining. Private windows, vertical tabs, and other Orion/macOS versions were not tested.

A cross-window follow-up found that activating Orion after raising the target could restore its previous key window, producing a focus error after the tab had already changed. WebKit focus now activates the application before raising and selecting the target window. The production-sequence regression failed before this change and passed afterward. Live Raycast checks switched to a pinned tab through the nested list and back to another window through root search; read-only AX checks confirmed the exact target window, and the window server reported zero visible Raycast main windows after completion.

### Browser focus follow-up (2026-11-14)

Chromium, Firefox AX, and native window focus now use the same activation order and verify the exact foreground window. Firefox/Zen companion requests also focus the uniquely reconciled macOS window when available. Without a unique native window match, the companion selects the exact tab/window and App Hopper activates the uniquely identified running browser process without guessing a native window. Stale known native identities and ambiguous browser processes still fail. Production-sequence regressions reproduced the old activation-order failure for Chromium, Firefox AX, and native window focus before the change.

Live Raycast checks passed cross-window switching and closing the panel for Chrome, Edge, Brave, Safari, Firefox, Zen, and Opera; Orion passed the earlier follow-up above. Native window IDs and zero visible Raycast main windows were checked independently. Firefox and Zen used their connected 1.0.1 companions. Temporary local test pages were used for distinct targets.

The Store review follow-up reproduced a false failure after successful companion selection when two Firefox windows had identical tab titles and no distinguishing AX URLs. Regression coverage now checks this path for both Firefox and Zen, browser-bundle isolation, rejection of ambiguous processes, activation updates delivered by the run loop, and actual activation failure. In the rebuilt Raycast extension, two temporary Firefox windows each contained one **New Tab** page. Selecting the companion row without native Space metadata switched successfully and returned the command to Raycast's root without an error. Both test windows were closed afterward, preserving the original window and its two tabs. This follow-up passed all 234 regressions, build, typecheck, and lint; the new fallback was manually checked in Firefox.

Vivaldi's browser UI is itself an AX web area: a test window with two tabs initially appeared as one fallback window-title row. Its internal UI is now traversed and both tabs/URLs are read. On Vivaldi 8.3.4191.44, AXPress returned success while only focusing the tab control. The fallback now uses the control's exact scripting tab ID, resolves its live window/index, and verifies the scripting active ID and AX selection before reporting success. Titles and cached positions do not determine the target.

The original no-op-press regression failed before this fallback and passed afterward. The final local build passed live Raycast A/B switching, identical-title tabs verified by their actual page/URL, and cross-window switching in both directions. Native checks confirmed the requested window was frontmost and zero Raycast main windows remained visible after each accepted switch. Both temporary test windows and their local fixture files were removed. Private windows, workspaces, collapsed tab stacks, and other Vivaldi versions were not tested.

## Runtime behavior

### Zen browser restart, 2026-11-15

After Zen became available to the desktop tool, two normal **⌘Q → Quit Zen → relaunch** cycles were performed in the existing profile. The first cycle independently confirmed that the original browser and native-host processes had exited. Both launches created new browser/native-host processes and companion sessions, automatically connected companion 1.0.1 to the generated Swift executable, and answered live status/list requests with two windows and ten tabs.

The first cycle returned the same window/tab counts but a different sorted URL digest. All returned URLs were nonempty; the original baseline retained only its digest, so the exact changed URL and cause remain unresolved. It is not counted as an unchanged-URL pass. The second cycle compared a fresh baseline with the restored session and retained the exact URL set, with zero added or removed URLs. Temporary plaintext URL data was removed from the acceptance record after comparison. Zen was returned to the original YouTube tab; no test tabs were added or closed and no browser preferences or companion version were changed.

Automatic reconnection after a full browser restart is verified. URL restoration has one passing cycle and one unresolved difference; do not generalize the passing cycle into a claim that every restart preserves every URL.

### Zen generated-helper reconnect, 2026-11-15

The installed signed companion 1.0.1 was connected through the repaired text launcher to Raycast's generated `app-hopper-native` executable. A supported `shutdown` request restarted only its native host; the running companion automatically created a new session and helper process through the same generated executable. Live `status` and `list` requests succeeded afterward. The two normal windows and ten tabs had an identical sorted URL set before and after reconnect; only counts and a digest were recorded, without browsing URLs or titles.

This verifies the installed companion's automatic native-host reconnection through the new launcher. No companion update or profile change was needed. Native Zen/Raycast windows were unavailable to the desktop tool during this initial follow-up; the later full browser quit/relaunch results are recorded above. Toolbar-triggered reconnection was not exercised here. Earlier browser-restart acceptance below used the previous helper packaging.

### Arrangement retention, 2026-11-15

The native Raycast loop **Browsers & Apps → search firefox → clear** repeatedly reset to Recently Used. A saved default, native `storeValue` and a stable dropdown ID did not fix that loop. Keeping the existing controlled dropdown mounted during search fixes it without changing the arrangement cache, grouping, matching or ranking rules. The arrangement control now stays visible during search.

Native checks passed search/clear for all four arrangements. Reopening App Hopper retained Name A–Z, By Space and Recently Used in the final build; the original Recently Used preference was restored. Regression coverage keeps the same arrangement control through matches, no matches, whitespace and clear, checks all four groupings, and verifies that changing the arrangement during search retains the query and applies the grouping after clear. The native dropdown reset itself requires Raycast acceptance; the mock renderer alone does not reproduce its initialization behavior.

All 236 regressions, complete typechecks, Raycast lint, the distribution build and Store verification passed. The 70-file Store export differs only in `src/app-hopper.tsx` and builds independently with its unchanged lockfile.

### Search request management, 2026-11-15

Root discovery now uses Raycast's `usePromise` for loading, errors, retry and cancellation. The snapshot store retains native-first updates, valid enrichment and completed-only cache writes. Aborted queries cannot publish, commit, or restore a confirmed closed window. Classification, matching, ranking and held result positions use the same modules as before.

All 235 regressions, full typechecks, lint and the distribution build passed. Tests exercise the installed `usePromise`, including overlapping requests, late success/failure after cancellation, unmounts, retry, all four arrangements, progressive URL matches and retained selection. Native Raycast displayed the browser/app sections and app/tab search results; refreshing kept the search text and results. Clearing search reset the native arrangement dropdown to Recently Used in both the previous PR build (`69b8e089`) and this candidate. The arrangement-retention follow-up above addresses that existing behavior.

### Store review follow-up, 2026-11-14

Window titles, subroles and process/index values now reach AppleScript/JXA through argument arrays. AX focus and discovery use fixed `on run argv` programs; fresh identity, ambiguity and closed-window checks remain in place. Regressions cover quotes, backslashes, Unicode and multiline window titles and compile both AX programs with macOS's AppleScript compiler. Complete validation passed 233 tests, typechecks, lint and the distribution build.

Application, search-result, window and browser-tab actions now all have icons, retaining their existing order and shortcuts. The application action menu was checked in native Raycast. Browser-window lists retain their visible targets and show progress during seeded checks and refreshes; a deferred regression verifies both phases and the final updated rows. Live loading-bar timing was not captured before the Raycast panel was closed.

### Swift package migration, 2026-11-14

Native helpers now come from `swift/app-hopper-native/` using `extensions-swift-tools` 1.1.0. Raycast compiles the executable during its own build; committed binaries, source-hash binary selection and runtime compilation were removed. Browser helpers retain separate processes and queues, including when they use the same package executable. Firefox/Zen setup creates a text launcher for the Store-built executable and keeps the signed companion protocol and 1.0.1 pin unchanged. Existing integrations can use **Repair Local Helper** to update their registered launch path.

The migrated package passed real Firefox and Zen native messaging tests through installed text launchers, including executable paths with spaces, apostrophes and a dollar sign, split message frames, live URLs, exact tab requests, malformed requests, EOF and shutdown cleanup. Startup with an empty support directory and compiler commands disabled also passed. All 231 regressions, complete TypeScript checks and Raycast lint passed. The distribution build produced both arm64 and x86_64 slices and passed its generated entry-point check. Live Raycast checks passed Edge and Safari tab selection and exact Code window focus without false failure. Firefox's local helper was repaired and the existing companion 1.0.1 reconnected through the new launcher. Zen's launcher was repaired and companion tab selection still worked; the reconnect and browser-restart follow-ups above verify its later automatic reconnection through the new package, with the recorded URL-restoration limits. Earlier acceptance below describes the previous helper packaging; Store/downloaded-install acceptance for the new package remains separate.

### Store submission candidate, 2026-11-14

The current distribution build passed all 209 regression tests, typecheck, lint, and verification of six universal native helpers. In Raycast, refreshing and searching a unique fragment found a background Chrome tab. **Switch to Tab** selected that exact tab and URL, and the command returned to Raycast's root. The temporary tab was closed and the original selected tab restored afterward. This verifies the local distribution build; Store review and downloaded-install acceptance remain separate.

The Firefox/Zen companion download remains pinned to the published signed 1.0.1 XPI. Its background JavaScript matches the current companion build byte for byte; the source manifest's 1.0.2 version is from an earlier signing test. This submission does not publish or repin the companion.

### Loading behavior

Startup rendering was checked in the rebuilt Raycast extension: two consecutive launches with a cache showed the app list in the first observed frame, and manual refresh retained the list. The progressive-loading follow-up publishes fresh native/app data before slow tabs, retains valid enrichment, and holds existing row positions during selection or typing. New matches append; disappeared targets stay visible without focus actions until the layout is reset.

All 167 tests, build, typecheck, lint, and Store verification passed after the follow-up. Regression coverage includes deferred browser queries, repeated enrichment arrivals, closed/restarted native identities, held Space sections, AX index reuse, exact selected tab actions, failed/cancelled refreshes, and disabled cached-row actions during permission checks. Live Raycast checks covered two warm launches, Firefox search, refresh with results present, browser drill-down, and returning with the query/selection retained. Cold-cache, injected slow-query, and disappearing-target timing scenarios were tested automatically; the live checks did not clear the daily-use account's cache or permissions.

The browser-loading follow-up carries known root tabs into browser navigation, shares identical in-flight scans, and gives each browser its own helper queue. All 171 tests, build, typecheck, lint, and Store verification passed. Tests cover immediate seeded rendering during a pending query, completed empty responses, shared scans, live refreshes, retry after failure, and a slow browser timing out without expiring another browser's retained targets. In rebuilt Raycast, Safari's three tabs and Edge's four tabs were visible in the first observed frame after opening each browser.

A read-only local comparison changed only helper queue sharing against the same running browsers: total browser-query time was 324 ms with engine-shared queues versus 270 ms with separate queues on the first pass, then 112 ms versus 54 ms on the warm pass. These are query timings, excluding native discovery and Raycast rendering. Earlier standalone first-run Safari/Edge queries timed out after 10 seconds; that timeout did not recur in the paired comparison, so its removal is not claimed as a measured speedup.

- Each command launch checks setup again. A previous successful permission check is not cached as authorization for a later launch.
- Missing Accessibility access opens a concise setup screen. Window discovery stays disabled until the user grants access and rechecks.
- Raycast builds native code from the pinned Swift package. Runtime discovers that generated executable through its exported Swift interface; a missing package shows the recovery screen.
- Developers compile the package with Xcode through `ray build` or `ray develop`. Installed extensions never invoke a compiler or install developer tools.
- The Firefox/Zen native host is registered through a per-user text launcher for the Raycast-built executable. The optional companion still requires Mozilla signing and its own configured download.
- Unknown Space values remain hidden. Space discovery and some AX window discovery use private macOS APIs, so compatibility must be checked after macOS/browser updates. Full-screen windows and multiple displays require explicit acceptance checks.
- All browsers display the reported tab title verbatim, including any pin, group, or memory-usage text supplied by the browser. App Hopper adds no pin or group accessories. Search and focus retain the same original title.

## Before claiming a supported environment

Use a clean user account or another Mac; do not copy this developer account's permissions or helper caches.

1. Install the actual downloaded release with no Command Line Tools installed. Confirm startup makes no compiler request and every bundled helper can run under the system's normal trust policy.
2. Test missing Accessibility permission, user-granted permission, **Check Again**, and reopening the command. Check Automation prompts for the System Events and browser fallbacks.
3. Test running, minimized, hidden, and windowless apps; single and multiple windows; duplicate-title tabs; moved/closed tabs; and helper/session expiry.
4. Verify single-window app Space labels, multi-window app omission, per-window/tab labels, and unknown Spaces across multiple displays and full-screen windows.
5. Install a supported browser outside `/Applications` and verify its icons, navigation, and exact tab focus.
6. Repeat on each claimed macOS version and on both Intel and Apple Silicon hardware. Rosetta execution alone is not Intel hardware acceptance.
7. Verify the helpers included in the actual Store download and confirm their execution under the system's normal trust policy. The Store build compiles the submitted Swift package; local checks verify its entry point and architectures, while downloaded Gatekeeper acceptance remains separate. If distributing a separate Developer ID-signed archive, complete its notarization and downloaded-artifact acceptance independently.

Reference: [Apple's notarization workflow](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
