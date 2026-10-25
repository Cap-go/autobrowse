# Auto Browse (capgo-browser)

Mobile AI browser for iOS and Android (Capacitor 8). Sign in with ChatGPT, chat with an agent, and let it drive a native in-app browser on your behalf.

## Features (scaffold)

- **Connect ChatGPT** first screen with Continue with ChatGPT (OAuth 2 + PKCE, plan-usage scopes).
- **Secure tokens** in iOS Keychain / Android Keystore via `capacitor-secure-storage-plugin` (never `localStorage`).
- **Chat UI** (text first; voice planned with on-device STT/TTS).
- **Agent loop** against the OpenAI Responses API (`store: false`, `stream: true`) using only the ChatGPT plan token.
- **Browser tools** mapped to `@capgo/capacitor-inappbrowser` (navigate, screenshot, click, type, scroll, read DOM, extract).
- **Native Duo sidebar** via `@capgo/capacitor-native-navigation`: Back, Browse, Tabs and Settings in the side rail. Other devices keep the web browser controls.

## Docs

- [OAuth loopback spike](docs/oauth-spike.md) (mobile redirect risks and fallbacks)
- [Autofill notes](docs/autofill.md) (password managers in the webview)
- [Deep links](docs/deeplinks.md) (`autobrowse://run?prompt=…`, universal links on capgo.app)
- [Android release](store/android/README.md) (SDK/JDK, upload signing, Play assets and emulator verification)

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

## App Store

Everything needed for App Store Connect lives in `store/`:

- `store/creative/apple/`: Header and Search Results artwork, generation tool instructions and verified App Store Connect draft assignments.

- `store/metadata.md`: name, subtitle, description, keywords, age rating, privacy label, review notes
- `website/`: https://autobrowse.dev (landing, privacy, terms, support, deep links, app-link files). `bun run site:deploy`
- `store/icon/`: 1024 icon source (`icon.svg`) and PNG
- `store/screenshots/`: 6.9" and 6.5" iPhone screenshots

Regenerate screenshots (needs `bun run dev` on port 5179):

```bash
bunx vite --port 5179 &
cd store/tools && bun install && bun shoot-raw.mjs && bun frame.mjs
```

Regenerate native icons and splash from `assets/`:

```bash
bunx @capacitor/assets generate --ios --android --iconBackgroundColor '#14c7c0' --splashBackgroundColor '#0b0d12'
```

## Live updates (Capgo)

Web-layer changes (everything in `src/`) ship instantly with [Capgo](https://capgo.app)
live updates, no App Store review. Delta updates send only changed files.

1. Bump `version` in `package.json` (patch for fixes, e.g. `1.0.1`).
2. `bun run release:live` (build + `@capgo/cli bundle upload --channel production --delta`).

Devices download in the background and switch on next launch. A bundle that does not
call `CapacitorUpdater.notifyAppReady()` within 10 s rolls back automatically.
Native changes (new plugins, `Info.plist`, entitlements) still need a store build.
Dashboard: https://console.capgo.app/app/app.capgo.browser
