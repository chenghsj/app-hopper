# App Hopper

A macOS Raycast extension for finding and switching between running applications, windows, and browser tabs.

## Downloads

[App Hopper Companion 1.0.1 release](https://github.com/chenghsj/app-hopper/releases/tag/companion-v1.0.1)

| File | Purpose |
| --- | --- |
| [Signed companion XPI](https://github.com/chenghsj/app-hopper/releases/download/companion-v1.0.1/app-hopper-companion-1.0.1.xpi) | Install the same Mozilla-signed add-on in Firefox and Zen. |
| [Companion source ZIP](https://github.com/chenghsj/app-hopper/releases/download/companion-v1.0.1/app-hopper-companion-1.0.1-source.zip) | TypeScript source, pinned dependencies and reproducible build instructions. |
| [SHA256SUMS](https://github.com/chenghsj/app-hopper/releases/download/companion-v1.0.1/SHA256SUMS) | Checksums for the signed XPI and source archive. |

**The companion requires the App Hopper Raycast extension.** This repository currently distributes the browser companion; it does not yet provide an installable App Hopper Raycast extension package. Installing the XPI alone does not install App Hopper or its local native helper.

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

The bridge is **not included in the XPI or installed by Enable Zen Integration**. This companion release does not distribute an end-user bridge installer. The currently tested bridge is an advanced local setup that changes Zen's AutoConfig startup files and requires a restart; Zen updates may require reinstalling it. Without the bridge, the companion is limited to tabs exposed by Zen's standard API.

## Migrate from the old Zen companion

Remove the old **App Hopper Zen Companion** (`app-hopper-zen@chenghsj`) and any temporary companion before installing the shared signed XPI. Prepare/repair the Zen local helper in the updated App Hopper. An existing local workspace bridge must also target the shared add-on ID.

Existing Firefox companion installations retain their original ID and can upgrade to version 1.0.1.

## Connection and permissions

- If the companion is installed but disconnected, run the corresponding setup command in Raycast, choose **Repair Local Helper**, then click the companion toolbar button or restart that browser and check the connection again.
- The add-on requests `tabs` and `nativeMessaging` to exchange tab titles, URLs and activation requests with the local App Hopper helper. Private-window access stays off unless explicitly granted in the browser.
- App/window switching and Accessibility-based browser support remain available without the companion. Hidden tab lists are reported as unavailable rather than assigned an invented count.
