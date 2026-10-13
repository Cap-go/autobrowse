# Google Play metadata — Auto Browse

## Listing

| Field | Value |
| --- | --- |
| Title (30 max) | Auto Browse |
| Short description (80 max) | An AI browser that reads pages, compares prices and gets things done for you. |
| Package | app.capgo.browser |
| Release | 1.0.0 (versionCode 1) |
| Category | Productivity |
| Contact email | tori@capgo.app |
| Privacy policy | https://autobrowse.dev/privacy/ |
| Website | https://autobrowse.dev/ |
| Ads | No |
| In-app purchases | No |

## Full description (4000 max)

Auto Browse is a web browser with an AI agent built in. Type what you want in plain words and the agent opens pages, reads them, scrolls, clicks and types for you, in a real browser you can see.

ASK, DON'T SEARCH
• "Summarize the top stories on Hacker News."
• "Find the best price for a 27 inch 4K monitor."
• "Find 3 well rated cafés near the Louvre."
The agent does the browsing and gives you a short answer.

WATCH IT WORK
Address bar, tabs, back and reload: the page sits right above the chat, so you see each step. Drag the divider to give more room to the page or the chat, collapse the chat to a small pill, and take over at any moment.

MANY TABS, MANY AGENTS
Every tab has its own page and chat. Compare prices in one tab, plan a trip in another, and switch between them while the agents work.

JUST SAY IT
Tap the mic and speak. Voice input uses your Android device's speech recognizer. Availability depends on your device and language.

TALK TO ANY PAGE
Open a website and ask about it: "summarize this", "find the cheapest one", "what are the opening hours?". Save and share files the agent creates.

YOU STAY IN CONTROL
The agent asks before important actions like buying, posting, sending a message or changing an account. Links to other apps ask for confirmation before leaving Auto Browse.

RUNS ON YOUR CHATGPT PLAN
Sign in with your ChatGPT account. AI requests go directly from your device to OpenAI using your own plan. There is no Capgo account or extra app subscription. AI features require an eligible ChatGPT account and internet access.

PRIVATE BY DESIGN
• Your sign-in credentials stay in secure device storage protected by Android Keystore.
• No ads or advertising tracking.
• Clear browsing data and sign out from Settings.
• Prompts and relevant page content are sent to OpenAI to run the agent. Capgo delivers app updates and receives update diagnostics.

WORKS WITHOUT SIGNING IN
Use Auto Browse as a normal browser. Sign in when you want the agent.

Auto Browse is made by Capgo. It is not affiliated with or endorsed by OpenAI. ChatGPT is a trademark of OpenAI.

Terms of Use: https://autobrowse.dev/terms/
Privacy Policy: https://autobrowse.dev/privacy/

## Assets

- Phone screenshots, upload in order: `store/screenshots/android-phone/01-chat.png` through `06-connect.png` (1080×2160, 2:1, opaque PNG).
- Feature graphic: `store/android/feature-graphic.png` (1024×500, opaque PNG).
- Icon: `store/android/icon-512.png` (512×512, opaque PNG; flat silhouette derived from `store/icon/AppIcon-1024.png`).
- Upload bundle: `store/android/auto-browse-1.0.0.aab` (generated locally, intentionally ignored by git).

## Data safety answers

Collection: **Yes**. No advertising use, sale, or advertising tracking. HTTPS protects app-controlled authentication, AI and update traffic. This browser also allows user-selected HTTP websites; do not claim every arbitrary website connection is encrypted.

| Play data type | Collected | Purpose | Optional / required |
| --- | --- | --- | --- |
| Personal info → Email address | Yes, OpenAI sign-in | App functionality | Optional; guest browsing works |
| App activity → Other user-generated content | Yes, prompts and relevant page text/screenshots sent to OpenAI | App functionality | Optional; only when using the agent |
| Web browsing → Web browsing history | Yes, URLs/page context sent to OpenAI when using the agent | App functionality | Optional; only when using the agent |
| Device or other IDs | Yes, installation ID and agent host ID used by OpenAI / Capgo updates | App functionality | Required for updates; AI identifier optional |
| App info and performance → Diagnostics | Yes, app/OS versions, update/launch status and errors sent by Capgo updater | App functionality | Required for update delivery and recovery |

OpenAI processes the AI request; Capgo processes live-update requests. Neither transfer is for ads. The Play sharing exemption for service providers applies only if their processing contract qualifies; verify the relevant terms before selecting **Not shared**. User-directed navigation and export are separate user-initiated transfers. Do not classify this app as advertising sharing.

Voice: Android's on-device/Google or installed system speech recognizer processes microphone audio. On-device recognition is preferred only when supported/configured by that recognizer; the default system recognizer may use Google's network service. Auto Browse does not upload raw microphone recordings to its own servers or to OpenAI. Recognized text becomes user content if submitted to the agent. System-service processing is covered by the system provider; do not assert that all devices process voice offline.

Local deletion: **Settings → Sign out** deletes stored OAuth tokens and closes tabs. **Settings → Close all tabs and clear browsing data** clears browser cookies/cache. Saved passwords can be removed under **Passwords & secrets**. Uninstalling deletes app-local data; Android backup is disabled. Signing out/uninstalling does not delete an existing OpenAI account or guarantee deletion of provider-side records. Users manage those through OpenAI's account/privacy controls and can contact tori@capgo.app about Capgo-held data.

Account creation: **No app-owned account creation**; sign-in uses an existing third-party ChatGPT account. A dedicated in-app server-data deletion request flow is not implemented. Do not answer the Play deletion-request question solely from the existence of Sign out; confirm the support deletion process before final submission.

Reference: [Google Play Data safety form guidance](https://support.google.com/googleplay/android-developer/answer/10787469). Include off-device processing even when requests use `store: false`; that flag is not a blanket retention/deletion guarantee.

## Content rating / app content

Use the utility/productivity questionnaire; final regional ratings are calculated by IARC.

| Question | Answer |
| --- | --- |
| Unrestricted web access | Yes; this is a general web browser |
| App-provided violence, sexual content, profanity, drugs, gambling, horror | None in the bundled UI; arbitrary websites and AI output are not curated |
| Gambling / real-money gambling features provided by app | No |
| User-to-user chat, social network, public posting inside app | No; the chat is with an AI agent |
| User-generated content accessible to other app users | No |
| Location sharing / location permission | No |
| Digital purchases / randomized rewards | No |
| Ads / Advertising ID | No / not used |
| Health or financial services | No |
| News app | No; users can browse news websites |
| Parental controls / age assurance | No |
| AI-generated content | Yes; optional browsing assistant |
| Target audience | Adults (18+) |

Do not copy the iOS age rating into Play; disclose unrestricted internet access and complete IARC's live questionnaire. Users can flag AI answers using the in-app Report sheet, without leaving the app, as required by the [AI-generated content policy](https://support.google.com/googleplay/android-developer/answer/13985936). See Generative AI policy below.

## App access / reviewer instructions

Guest browsing does not require credentials. AI features require ChatGPT sign-in.

- Demo ChatGPT account: **review@capgo.app**.
- Password: **password provided in Play Console App access**. Never commit it here.
- Before submission, confirm the demo account has an eligible plan and can be accessed by reviewers without an unavailable 2FA challenge.

1. Swipe through onboarding or tap Skip.
2. Tap **Browse without signing in**, enter a website, and test tabs, back, reload and the page/chat divider.
3. To test AI, use **Continue with ChatGPT** and the demo account above. OpenAI's login page opens inside the app. The OAuth callback is intercepted before loading a blocked loopback URL.
4. Ask "Open Hacker News and summarize the top 3 stories." Watch the native page and chat. Drag the divider to collapse chat; tap the Chat pill to reopen it.
5. Microphone permission is optional; typing works without it. Save / Share opens Android's Sharesheet for generated files.
6. Settings provides Sign out and browsing-data clearing. Auto Browse creates no separate account, has no ads and sells no in-app purchases.

## Generative AI policy

Every AI answer has a **Report** button (flag icon) that opens an in-app sheet
(reason + optional details). Reports are sent without leaving the app to
`workers/report` (Cloudflare Worker, https://autobrowse-report.digitalshift-ee.workers.dev/report),
which emails them to tori@capgo.app.

Verified on 2026-10-13 with one clearly labelled synthetic QA report submitted
through the real in-app sheet in a headless browser. The live endpoint returned
HTTP 200 with `{"ok":true}` after Cloudflare accepted the email; the sheet closed
and the app remained on the same page. Inbox receipt was not independently checked.
Reports are limited to five requests per minute per IP. Invalid JSON returns 400;
email failure returns 502 and the app allows retrying.
