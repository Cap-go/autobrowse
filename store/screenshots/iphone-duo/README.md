# iPhone Duo screenshots and verification

Captured on 2026-10-25. Auto Browse now uses `@capgo/capacitor-native-navigation` 8.14.0 to put native Back, Browse, Tabs and Settings controls in Duo's side rail. The iOS app allows portrait and both landscape orientations. The browser, tab switcher and sheets share the horizontal safe-area insets.

## Native side navigation

The app requests the plugin's system sidebar with `setTabbar({ style: { placement: 'sidebar' } })`. It enables this on iOS when the native safe-area report includes a side inset of at least 64 points. Once detected, the sidebar stays enabled across display changes, including when UIKit reparents the app WebView. Regular iPhones, Android, web previews and native builds without the plugin keep their existing web controls.

Back calls InAppBrowser's native history API. It returns to the start page when the current page has no earlier history entry, and is disabled on the start page. This avoids depending on the page's JavaScript navigation API, which cannot reliably describe cross-origin browser history. The duplicate web Back and Tabs controls are hidden while the native sidebar is active. The address bar and Menu remain in the web UI.

Tabs and Settings open the existing dialogs. The native rail soft-hides using `animated: true` and the same item list, then returns when the dialog closes. This preserves the native tab host instead of clearing and rebuilding it during each modal.

`BrowserHostView` keeps framed InAppBrowser navigation-controller views above the native tab host and routes touches to those visible page frames first. Outside a page frame, normal UIKit hit testing reaches the address bar, chat and native rail. This prevents a fold/layout pass from covering a live website with the app's start page. `BrowserLayout.getOrigin()` maps web viewport coordinates into window points for the framed browser. Older native binaries without this helper retain their original zero-origin behavior.

The sidebar requires a new iOS native build, not just an OTA update. The new JavaScript falls back to web controls when the native plugin is unavailable.

## Screenshot sets

| Folder | Source | PNG dimensions |
| --- | --- | --- |
| `closed/` | Development demo UI, Chromium, outer-display viewport | 1398 × 2034 |
| `open/` | Development demo UI, Chromium, inner-display landscape viewport | 2853 × 2007 |
| `../../raw/iphone-duo/closed/` | Installed iOS app, native outer-display capture | 1398 × 2034 |
| `../../raw/iphone-duo/open/` | Installed iOS app, native inner-display landscape capture | 2853 × 2007 |

Each demo set includes four onboarding screens, connect, start page, chat, shopping, tabs and settings. The chat replies, websites and signed-in demo account are illustrative fixtures, not evidence of a real authenticated agent run. The previews reserve a side safe area but cannot render the UIKit sidebar or native status graphics. Use the captures in `store/raw/iphone-duo/` to review the actual native design. They show the installed app browsing as a guest.

These are additional local store assets. Existing 6.5-inch and 6.9-inch App Store screenshots are unchanged. No App Store Connect upload or review submission was performed; these Duo dimensions have not been verified against an App Store Connect screenshot slot.

## Regenerate demo screenshots and layout checks

From the repository root:

```sh
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd store/tools
bunx vite --host 127.0.0.1 --port 5179
```

In another terminal:

```sh
bun store/tools/shoot-iphone-duo.mjs
```

Set `BASE` to use a different development-server URL. The tool resolves its output directory relative to its own file, so it can also run from `store/tools`.

The checks cover ten states at four viewports: 466 × 678, 951 × 669, 678 × 466 and 669 × 951 CSS pixels. Safe-area fixtures stress an 84-point strip on either side as well as top/bottom insets. They check page overflow, screen bounds, onboarding headings/buttons, and sheet/tab controls. Four additional resize sequences keep an existing conversation while opening and closing the tab switcher at every size.

Before the safe-area fix, the tab switcher's Done button extended to x=456 in a viewport whose usable right edge was x=382. The check rejected that layout; it passes with the shared horizontal insets.

## Native build and captures

This machine's default `xcode-select` points to Command Line Tools. Use an explicit developer directory rather than changing the machine-wide selection:

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
bun run build
bunx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/autobrowse-iphone-duo-build \
  CODE_SIGNING_ALLOWED=NO build
```

Install the resulting `App.app` on a dedicated iPhone Duo simulator. Navigate the real app before capturing. For the simulator used here, the outer display was ID 1 and the inner display ID 3:

```sh
xcrun simctl io "$UDID" screenshot --display=1 --mask=ignored closed.png
xcrun simctl io "$UDID" screenshot --display=3 --mask=ignored open.png
```

Only capture the lit panel; the inactive panel produces a black PNG. Check display IDs and inspect the resulting image instead of assuming they are portable. Native images retain the system-rendered side status area. PNG alpha can be removed without changing the displayed content using `magick image.png -alpha off image.png`.

Validation: the Debug simulator build, production web build, TypeScript, ESLint, all 64 unit tests, 40 viewport/state checks and four conversation-resize sequences passed. Signed-in ChatGPT/OAuth flows, real agent execution, microphone input and physical hardware were not tested for this change.

Native verification used Xcode 27.1 and an iOS 27.1 iPhone Duo simulator. The app entered guest mode, accepted addresses through the software keyboard and loaded public HTTPS pages. A native Back tap returned from `example.org` to `example.com`; Back on the first page then returned to the start page and cleared the address. The page, address and scroll position survived both display-change directions. A pan inside the page scrolled the real website, confirming that native page touches still work above the tab host. Tabs and Settings were opened, captured and dismissed on both panels, and the rail returned after dismissal. `browser.png` captures show live pages with the native rail; `back-after.png` records a Back result on each display.

The device panel could not discover iOS with the machine's default Command Line Tools selection, so the installed device CLI and `simctl` were used with the explicit developer directory. The CLI delivered the hinge change, but its subsequent numeric angle-readback command is unsupported by this CoreDevice version. The lit inner panel, resized UI and retained page were verified by native screenshots and accessibility snapshots instead. Exact hinge angles and the half-open posture remain unverified.
