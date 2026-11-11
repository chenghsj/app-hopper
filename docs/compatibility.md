# Compatibility and release checks

## Current evidence

| Environment               | Evidence                                                                            | Remaining acceptance                                             |
| ------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| macOS 27.2, Apple Silicon | Local Raycast workflows and automated regression suite                              | Clean user account and downloaded release installation           |
| Intel helper slices       | Cross-compilation, universal-binary architecture checks, code signature validation  | Execution on an Intel Mac                                        |
| Other macOS versions      | Helpers compile with a macOS 13.0 deployment target and guard newer activation APIs | Full window/tab and permission workflows on each claimed version |
| Windows / Linux           | Not supported                                                                       | No support claimed                                               |

Raycast's own system requirement also applies and can be newer than the helpers' deployment target. Do not advertise a minimum supported macOS version based solely on a compiler target.

## Runtime behavior

- Each command launch checks setup again. A previous successful permission check is not cached as authorization for a later launch.
- Missing Accessibility access opens a concise setup screen. Window discovery stays disabled until the user grants access and rechecks.
- Packaged helpers are selected by the hash of their Swift sources and verified against the bundled binary checksum. Corrupt packages show a recovery screen rather than silently compiling replacement code.
- A development checkout may compile missing helpers when developer tools are installed. An unprepared checkout without those tools shows the installation command; App Hopper never installs tools automatically.
- The Firefox native host is copied into its per-user directory from the bundled helper when available. The optional companion still requires Mozilla signing and its own configured download.
- Unknown Space values remain hidden. Space discovery and some AX window discovery use private macOS APIs, so compatibility must be checked after macOS/browser updates. Full-screen windows and multiple displays require explicit acceptance checks.
- Chromium title decoration decoding currently recognizes verified English and Traditional Chinese labels. Other formats retain their original title and do not affect tab identity or activation.

## Before claiming a supported environment

Use a clean user account or another Mac; do not copy this developer account's permissions or helper caches.

1. Install the actual downloaded release with no Command Line Tools installed. Confirm startup makes no compiler request and every bundled helper can run under the system's normal trust policy.
2. Test missing Accessibility permission, user-granted permission, **Check Again**, and reopening the command. Check Automation prompts for the System Events and browser fallbacks.
3. Test running, minimized, hidden, and windowless apps; single and multiple windows; duplicate-title tabs; moved/closed tabs; and helper/session expiry.
4. Verify single-window app Space labels, multi-window app omission, per-window/tab labels, and unknown Spaces across multiple displays and full-screen windows.
5. Install a supported browser outside `/Applications` and verify its icons, navigation, and exact tab focus.
6. Repeat on each claimed macOS version and on both Intel and Apple Silicon hardware. Rosetta execution alone is not Intel hardware acceptance.
7. Check Developer ID signatures, complete notarization of the actual helper archive, and confirm downloaded-artifact Gatekeeper acceptance. `verify:native` checks structure/signatures, not notarization.

Reference: [Apple's notarization workflow](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
