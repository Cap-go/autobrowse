# App Store Connect metadata — Auto Browse (iOS)

Copy/paste source for App Store Connect. Character limits noted.

## App information

| Field | Value |
| --- | --- |
| Name (30) | Auto Browse |
| Subtitle (30) | AI agent that browses for you |
| Apple ID | 6821215230 |
| Bundle ID | app.capgo.browser |
| SKU | capgo-browser-ios |
| Primary language | English (U.S.) |
| Primary category | Productivity |
| Secondary category | Utilities |
| Content rights | Yes, accesses third-party content (user-chosen websites in a web browser) |
| Copyright | 2026 Digital shift OU |
| Version | 1.0.0 (build 1) |
| Devices | iPhone only |

## URLs

| Field | Value |
| --- | --- |
| Privacy Policy URL | https://capgo.app/privacy/ |
| Terms (EULA, in description or custom EULA) | https://capgo.app/tos/ |
| Support URL | https://capgo.app/contact/ |
| Marketing URL | https://capgo.app/ |

Uses existing Capgo pages. `store/legal/*.md` holds app-specific drafts if dedicated pages are wanted later.

## Promotional text (170)

Tell it what you need. Auto Browse opens websites, reads them and gets things done while you watch. Runs on your own ChatGPT plan.

## Description (4000)

Auto Browse is a web browser with an AI agent built in. Type what you want in plain words and the agent opens pages, reads them, scrolls, clicks and types for you, in a real browser you can see.

ASK, DON'T SEARCH
• "Summarize the top stories on Hacker News."
• "Find the best price for a 27 inch 4K monitor."
• "Find 3 well rated cafés near the Louvre."
The agent does the browsing and gives you a short answer.

WATCH IT WORK
The page opens right above the chat, so you see every step live: searching, reading, tapping, typing. Expand the page, or close it and take over at any moment.

JUST SAY IT
Tap the mic and speak. Your words appear as you talk and the agent starts when you stop.

TALK TO ANY PAGE
Open a website and ask about it: "summarize this", "find the cheapest one", "what are the opening hours?".

YOU STAY IN CONTROL
The agent asks before anything important like buying, posting, sending a message or changing an account.

RUNS ON YOUR CHATGPT PLAN
Sign in with your ChatGPT account. Requests go straight from your iPhone to OpenAI using your own plan. There is no Capgo account and no extra subscription.

PRIVATE BY DESIGN
• Your sign in is stored only in the iOS Keychain.
• No ads, no tracking, no analytics.
• Clear the browser session and sign out anytime from Settings.

WORKS WITHOUT SIGNING IN
Use Auto Browse as a simple, fast browser. Sign in only when you want the agent.

Auto Browse is made by Capgo. It is not affiliated with or endorsed by OpenAI. ChatGPT is a trademark of OpenAI.

Terms of Use: https://capgo.app/tos/
Privacy Policy: https://capgo.app/privacy/

## Keywords (100, comma separated, no spaces)

ai,agent,browser,chatgpt,assistant,automation,voice,summarize,research,shopping,compare,gpt,autopilot

(99 characters)

## What's New (first version)

First release. Ask the agent to browse for you, watch every step, and stay in control.

## Screenshots

Upload in this order (already sized, no alpha):

- 6.9" iPhone (1320×2868): `store/screenshots/iphone-6.9/01..05-*.png`
- 6.5" iPhone (1284×2778): `store/screenshots/iphone-6.5/01..05-*.png`

App icon 1024×1024 (no alpha): `store/icon/AppIcon-1024.png` (also inside the Xcode asset catalog).

## Age rating questionnaire

| Question | Answer |
| --- | --- |
| Unrestricted web access | **Yes** (it is a browser) |
| All violence / sexual / profanity / drugs / gambling / horror categories | None |
| Contests | No |
| User generated content / messaging between users | No |
| Medical or treatment info | No |
| Parental controls / age assurance | No |
| Result | 16+ (calculated by App Store Connect) |

## App Privacy (nutrition label)

Data collection: **Yes**, but only what is needed for the feature, never used for tracking.

| Data type | Collected | Linked to user | Tracking | Purpose |
| --- | --- | --- | --- | --- |
| Contact Info > Email Address | Yes (from ChatGPT ID token, kept on device; sent to OpenAI as part of auth) | Yes | No | App Functionality |
| User Content > Other User Content (prompts, page text sent to OpenAI) | Yes | Yes | No | App Functionality |

Everything else: Not collected. No third-party SDKs, no analytics, no ads.
Rationale: prompts and page content are transmitted off device to OpenAI (Responses API, `store: false`) to run the agent, which Apple counts as "collected" even if Capgo never sees it.

## Export compliance

`ITSAppUsesNonExemptEncryption = NO` is set in Info.plist (only standard HTTPS/Keychain). No documentation needed.

## App Review information

| Field | Value |
| --- | --- |
| Contact | Same contact as the team's other apps in App Store Connect |
| Sign-in required | No (browser works without sign in; agent uses reviewer's ChatGPT) |

### Notes for the reviewer

```
Auto Browse is a WebKit browser with an optional AI agent.

1. Without signing in: tap "Browse without signing in". You can type any
   address in "Search or enter website" or tap Google / Wikipedia / Hacker News.
   This opens the in-app WKWebView browser.

2. Agent: tap "Continue with ChatGPT" and sign in with the demo ChatGPT account
   below (OpenAI's official "Sign in with ChatGPT" OAuth 2 + PKCE flow, opened in
   ASWebAuthenticationSession). Then tap a suggestion like "Summarize news". The
   agent opens the page in the browser and replies in the chat. Each step is
   shown as a chip ("Opening...", "Reading the page").

The AI agent uses the reviewer's own ChatGPT account through OpenAI's
official Sign in with ChatGPT (a free ChatGPT account works). If you need a
dedicated test account, contact tori@capgo.app and we will provide one
within 24h.

- Sign out and data clearing: Settings (gear icon) > Sign out /
  "Close browser and clear session". No account is created by this app, so
  there is no account to delete; signing out deletes all stored tokens from
  the Keychain.
- The agent asks the user before purchases, posting, messages or account changes.
- All AI requests go directly from the device to OpenAI using the user's own
  ChatGPT plan. No in-app purchases. No ads, no tracking.
- The app is not affiliated with OpenAI; it uses OpenAI's public Sign in with
  ChatGPT program for third-party apps.
```
