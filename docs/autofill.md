# Password manager and autofill

Auto Browse is meant to behave like a normal mobile browser for credentials: users should get **iOS Password AutoFill** and **Android Autofill Framework** when logging into sites inside the agent-controlled webview.

## Architecture choice

We use `@capgo/capacitor-inappbrowser` **`openWebView()`** (native `WKWebView` on iOS, `WebView` on Android), not a headless or off-screen view. The agent drives the page through `dispatchInputEvent`, `executeScript`, and screenshots, but the web content stays in a real webview users can focus for manual login.

The iPhone Duo sidebar uses `@capgo/capacitor-native-navigation`. Website fields remain in the InAppBrowser WebView, separate from the native navigation controls.

## iOS configuration (scaffold)

| Item | Status |
| --- | --- |
| `WKWebView` with user interaction | Provided by `openWebView` |
| Associated Domains for universal links | **Not required** for basic password autofill |
| `textContentType` / AutoFill hooks from the app shell | **Not customized yet** (relies on web input types inside pages) |
| `ASWebAuthenticationSession` for ChatGPT login | Separate from site autofill (OAuth only) |

### Expected behavior

Safari AutoFill should offer saved passwords when the page exposes standard `<input type="password">` fields and the webview is frontmost. iCloud Keychain and third-party password managers that integrate with iOS AutoFill should work without extra native code **if** Apple treats the embedded `WKWebView` like other in-app browsers.

### Gaps / unverified

- No on-device test suite in CI validates AutoFill UI.
- Agent-driven `dispatchInputEvent` clicks may not trigger the same AutoFill heuristics as a direct user tap (needs manual QA).
- Cross-origin iframes for login widgets may block autofill (site dependent).

## Android configuration (scaffold)

| Item | Status |
| --- | --- |
| `android:importantForAutofill` on the hosting activity | Set to `yes` in `android/app/src/main/AndroidManifest.xml` (after `cap add android`) |
| WebView autofill enabled | Default for `android.webkit.WebView` when importance is set |
| Digital Asset Links | **Not required** for basic autofill |

### `AndroidManifest` snippet

```xml
<activity
  android:name=".MainActivity"
  android:importantForAutofill="yes"
  ... />
```

### Gaps / unverified

- Autofill provider selection (Google Password Manager vs 1Password) not tested in CI.
- Agent synthetic clicks vs real touches may differ for the Autofill framework.
- Custom WebView clients inside the plugin may need `importantForAutofill` on the webview itself (verify during device QA).

## Manual test plan

1. Open `https://example.com` or a test login page with email and password fields.
2. Tap the password field manually (not via the agent) and confirm the OS autofill prompt appears.
3. Save a new credential via the system UI, reload, confirm it is offered again.
4. Repeat on the second platform.

## Future work

- Add a small in-app "manual control" mode that temporarily disables agent input forwarding so users can complete MFA and autofill without race conditions.
- Document per-site results in a shared QA sheet once devices are available.
