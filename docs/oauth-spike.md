# OAuth loopback (Sign in with ChatGPT)

Auto Browse uses public OAuth 2 + PKCE (S256), plan-usage scopes, and an HTTP loopback redirect at `127.0.0.1` with `/auth/callback`. Tokens and the issued client ID stay in secure device storage (Keychain on iOS; Keystore-backed storage on Android).

## Native flow

1. `beginOAuthAttempt()` starts the local `@capgo/oauth-loopback` listener to obtain a port and redirect URI, then creates state, nonce and PKCE values.
2. `runAuthorizationInBrowser()` registers and awaits URL/close listeners before opening `InAppBrowser.openWebView()`. Native sign-in uses the in-app webview on both platforms, with a compact toolbar and `blockedHosts: ['127.0.0.1']`.
3. The browser cancels navigation to the loopback host and emits `urlChangeEvent` containing the callback URL. Android plugin 8.22.2 explicitly emits this event for blocked main-frame navigations before returning `true` from `shouldOverrideUrlLoading`; no dependency patch is needed.
4. The callback must match the exact redirect origin and path. The app then validates state and the issued client ID, exchanges the authorization code and verifies the ID token. URL/close listeners and the webview are cleaned up in `finally`; the loopback listener is stopped when sign-in finishes.

The iOS login uses the existing Mobile Safari user agent; Android uses its own mobile Chrome user agent with the embedded-WebView markers removed. This does not guarantee acceptance by every third-party identity provider.

The Android loopback server now compiles against NanoHTTPD and binds specifically to `127.0.0.1`, rather than all interfaces. Native authorization does not need the callback network request to reach this server; it captures the blocked redirect before loading it.

## Verified on Android

API 36 ARM64 emulator / Android WebView 133:

- OpenAI's login page loads inside the native webview.
- Closing the webview cancels sign-in and re-enables the connect button.
- A synthetic navigation to the blocked callback reaches the real `runAuthorizationInBrowser()` flow, returns the test code/state/client ID, passes callback validation, and closes the login webview.
- Secure-storage set/get/remove succeeds.

A real ChatGPT sign-in, issued tokens, token refresh, consent and identity-provider MFA were not tested. No reviewer password or real account credentials were used. See `store/android/verification.md`.

## Web development

The web implementation uses the local plugin's BroadcastChannel callback mechanism. It has no real HTTP loopback listener; use the native shell to validate provider login and blocked redirects. Demo states are development-only and are excluded from production builds.

## Security and remaining device checks

State, nonce and PKCE verifier are held in memory. Access/refresh tokens and client IDs use secure storage; tokens never belong in web storage or logs. After an actual sign-in, verify refresh/rotation, revoke the app in ChatGPT, and check network failure and expired-token handling. Password manager autofill and third-party identity-provider login still need physical-device QA.
