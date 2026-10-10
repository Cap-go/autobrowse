# OAuth loopback spike (Sign in with ChatGPT)

OpenAI documents Sign in with ChatGPT for open-source clients as a **public OAuth 2 + PKCE (S256)** flow with an **HTTP loopback redirect** on `127.0.0.1` (not `localhost`, fixed path, port may change per attempt). See:

- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Quickstart](https://developers.openai.com/siwc/quickstart)

This app must use plan-usage scopes (`offline_access`, `resource.invoke`, `chatgpt.tokens.use.direct`) with `resource=https://api.openai.com/v1`, store tokens in Keychain/Keystore, and never persist them in web storage.

## What we implemented

| Layer | Approach |
| --- | --- |
| PKCE + authorize URL | TypeScript in `src/auth/oauth.ts` and `src/auth/pkce.ts` |
| Token storage | `capacitor-secure-storage-plugin` via `src/auth/secure-storage.ts` |
| Loopback listener | Local Capacitor plugin `@capgo/oauth-loopback` (NanoHTTPD on Android, `NWListener` on iOS loopback) |
| System browser for login | Primary: `@capgo/capacitor-inappbrowser` `openSecureWindow()` with the same `http://127.0.0.1:<port>/auth/callback` redirect |
| Loopback fallback | If `openSecureWindow` fails, wait on `OAuthLoopback.waitForCallback()` while opening the authorize URL in the secure session |

### Why both loopback and `openSecureWindow`?

OpenAI requires loopback. `@capgo/capacitor-inappbrowser` documents custom URL schemes for mobile `openSecureWindow`, but also accepts an arbitrary `redirectUri` string and validates the final redirected URL. We pass the loopback URI so the flow matches the provider contract when the OS allows it.

The `@capgo/oauth-loopback` plugin exists because **something in the app process must accept `http://127.0.0.1:<port>/auth/callback`** when the system browser returns to loopback instead of handing the URL to `ASWebAuthenticationSession` alone.

## Platform notes (honest status)

### iOS (unverified on device in CI)

- **Intended path:** `OAuthLoopback` binds `NWListener` on loopback, then `openSecureWindow` opens `https://auth.openai.com/...` with `redirectUri` set to the listener URL.
- **Risk:** Apple’s `ASWebAuthenticationSession` historically favored custom schemes; loopback support for third-party OAuth varies by iOS version. We have not run this against a physical device in automated CI.
- **Fallback:** Keep the loopback server running and use a full-screen `openWebView` only if product testing shows `openSecureWindow` cannot complete loopback (not enabled in this scaffold).

### Android (unverified on device in CI)

- **Intended path:** NanoHTTPD loopback server in the app process + Custom Tabs via `openSecureWindow`.
- **Risk:** Some OEM browsers may not route `127.0.0.1` back into the hosting app; user may need the default Chrome custom tab provider.
- **Fallback:** Same as iOS: rely on loopback listener and retry with a fresh port if the tab stalls.

### Web (dev only)

- `OAuthLoopback` web implementation uses a `BroadcastChannel` compatible with `openSecureWindow` on web. There is **no real loopback server in the browser**; desktop dev should use the native shells for realistic OAuth testing.

## Token lifecycle

- Access token TTL: 1 hour (per OpenAI docs).
- Refresh token: 30 days, rotating (replace stored refresh token on every refresh).
- On `401` or near expiry, `src/agent/loop.ts` calls `refreshAccessToken()` before Responses API calls.

## Security

- Tokens and host id live only in secure storage.
- OAuth `state`, `nonce`, and PKCE verifier are kept in memory for the pending attempt only.
- Logs must not print tokens (enforced by convention; add lint rules later if needed).

## Next manual test checklist

1. Fresh install, tap **Continue with ChatGPT**, complete login, confirm `oaiapp_` client id is stored.
2. Kill app, relaunch, confirm silent reauth with saved client id (account picker or `id_token_hint` flow).
3. Revoke app in ChatGPT settings, confirm graceful error.
4. Airplane mode during token refresh, confirm user-visible error without crash.
