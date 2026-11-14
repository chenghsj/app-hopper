# Native helpers

App Hopper uses Raycast's [extensions-swift-tools](https://github.com/raycast/extensions-swift-tools). The executable package is `swift/app-hopper-native/`; `ray build` and `ray develop` compile it and include the result automatically. The repository and Store submission contain Swift source and `Package.resolved`, with no committed native executables or runtime compilation. Store users need no developer tools.

## Build and verify

Developers need Xcode 16.3 or later and Node.js 24:

```sh
npm ci
npm run build
npm run verify:native
npm test
```

Raycast generates `assets/compiled_raycast_swift/app-hopper-native` and its TypeScript interface. Generated binaries, Xcode data and Swift package caches are ignored by Git. `verify:native` checks the actual generated entry point and architecture list. Signing and downloaded-install trust remain part of Raycast distribution acceptance. `verify:store` checks tracked Swift sources and listing assets and rejects committed executables.

## Entry points and lifecycle

`helper-entry.swift` exposes `helperExecutablePath` and `runHelper` through `@raycast`. The TypeScript Swift import activates Raycast's build integration; workers invoke the generated entry point with JSON-encoded arguments. Each native operation runs on the main actor so AppKit activation updates can be delivered through the run loop.

- `runtime-status` reads Accessibility permission without requesting it.
- `MacOSWindowsHelper` discovers apps/windows and focuses exact native identities.
- `ChromiumHelper`, `WebKitHelper`, and `FirefoxHelper` keep their engine-specific traversal and focus policies. Each browser owns a separate process and serialized JSON-line queue. Retained AX tab references live for that process; closing stdin terminates it. A slow browser cannot expire another browser's targets.
- `FirefoxBridge` keeps the existing length-prefixed native messaging and per-session Unix socket protocols. Firefox or Zen owns the process. Installation writes a small, shell-escaped text launcher pointing to Raycast's generated executable. It neither copies a binary nor invokes a compiler. Moving the extension or changing its installed path requires **Repair Local Helper**.

Shared discovery, tab-reference storage and exact-window focus remain canonical Swift sources in the same package. Browser matching, Space metadata and focus validation retain their existing behavior. The signed companion protocol and release pin are unchanged.

No browsing-history or session-restore database is read. Tab data travels through local IPC; Raycast's local cache retains the latest search snapshot. Downloaded-install acceptance, Intel hardware, permissions and browser workflows remain separate checks in the [compatibility guide](compatibility.md).
