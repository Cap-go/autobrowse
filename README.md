# capgo-browser

Mobile AI browser for iOS and Android (Capacitor 8). Sign in with ChatGPT, chat with an agent, and let it drive a native in-app browser on your behalf.

## Features (scaffold)

- **Connect ChatGPT** first screen with Continue with ChatGPT (OAuth 2 + PKCE, plan-usage scopes).
- **Secure tokens** in iOS Keychain / Android Keystore via `capacitor-secure-storage-plugin` (never `localStorage`).
- **Chat UI** (text first; voice planned with on-device STT/TTS).
- **Agent loop** against the OpenAI Responses API (`store: false`, `stream: true`) using only the ChatGPT plan token.
- **Browser tools** mapped to `@capgo/capacitor-inappbrowser` (navigate, screenshot, click, type, scroll, read DOM, extract).
- **Native chrome** via `@capgo/native-navigation` (navbar, tab bar, safe areas).

## Docs

- [OAuth loopback spike](docs/oauth-spike.md) (mobile redirect risks and fallbacks)
- [Autofill notes](docs/autofill.md) (password managers in the webview)

## Requirements

- [Bun](https://bun.sh) for scripts and tests
- Xcode / Android Studio for native shells

## Setup

```bash
bun install
bun run build
bunx cap sync
```

Open native projects:

```bash
bunx cap open ios
bunx cap open android
```

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Vite dev server (web shell only) |
| `bun run build` | Production web bundle into `dist/` |
| `bun run typecheck` | TypeScript |
| `bun run lint` | ESLint |
| `bun test` | Unit tests (PKCE, OAuth parsing, agent helpers) |
| `bun run cap:sync` | Copy web assets and update native projects |

## Architecture

```
src/auth/*        Sign in with ChatGPT (PKCE, token refresh, secure storage)
src/agent/*       Responses API streaming + browser tool dispatch
src/browser/*     Thin wrapper over capacitor-inappbrowser
plugins/oauth-loopback   Loopback redirect listener for OAuth on mobile
```

## Agent constraints

This route does **not** support hosted MCP, native computer use, or image generation tools. The model may only call the browser function tools defined in `src/agent/tools.ts`.

## License

Private Capgo repository. See LICENSE if present.
