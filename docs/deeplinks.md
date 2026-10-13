# Deep links

Other apps, web pages, ChatGPT answers, Shortcuts, emails or QR codes can open
Auto Browse and prepare a task. Public docs: https://autobrowse.dev/deeplinks/

## Formats

| Link | What it does |
| --- | --- |
| `autobrowse://run?prompt=…&url=…` | New tab, loads `url` (optional), offers `prompt` with a Start card |
| `autobrowse://open?url=…` | New tab with `url` |
| `https://autobrowse.dev/run?…` | Same as `run` (universal link; falls back to a web page when the app is not installed) |
| `https://autobrowse.dev/open?…` | Same as `open` |

Parameters:

- `prompt`: URL-encoded task, up to 2000 characters.
- `url`: page to open; only `https://` is accepted.
- `tab`: `new` (default) or `current`. A blank current tab is reused.

```js
const link = 'https://autobrowse.dev/run?' + new URLSearchParams({
  prompt: 'Summarize this page in 5 bullets',
  url: 'https://news.ycombinator.com',
});
```

## Safety

Links never start the agent on their own: the agent acts inside the user's
logged-in sessions, so anyone could otherwise craft a link that buys or posts
something. The task is shown in a card with **Start**, **Edit** and **Dismiss**.
If the user is not signed in, Start asks them to sign in first.

## Implementation

- Parser and validation: `src/deeplink.ts` (tests in `tests/deeplink.test.ts`)
- Handling: `App.handleDeepLink` → `BrowserScreen.handleDeepLink`
- Listeners: `appUrlOpen` (warm start) and `getLaunchUrl()` (cold start) in `src/main.ts`
- iOS: `CFBundleURLTypes` (`autobrowse`) in `Info.plist`, `applinks:autobrowse.dev`
  (and the older `applinks:capgo.app`) in `App/App.entitlements`
- Android: intent filters in `AndroidManifest.xml`
- Website: `website/` (deployed to https://autobrowse.dev) serves
  `apple-app-site-association` and `assetlinks.json` for `/run*` and `/open*`,
  plus fallback pages for both paths. Older `capgo.app/autobrowse/*` links still work.

Test on a simulator:

```bash
xcrun simctl openurl booted "autobrowse://run?prompt=Summarize%20this&url=https%3A%2F%2Fnews.ycombinator.com"
```
