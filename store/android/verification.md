# Android verification — 2026-10-12

## Environment and builds

- AVD: `capgo_mem_api36` (Pixel 7 profile), Android 16 / API 36, ARM64 Google APIs image, 1080×2400 at 420 dpi (devicePixelRatio 2.625); Android WebView 133.
- SDK: `~/Library/Android/sdk`; JDK: Android Studio JBR 21.0.10.
- The T3 Device panel's `device_open` failed to boot/attach. The SDK emulator was launched headlessly using `emulator -avd capgo_mem_api36 -no-window -no-audio -no-snapshot -gpu swiftshader_indirect`. ADB and the debug WebView's DevTools socket were used for testing. No account credentials were entered.
- `bun run typecheck`, `bun run lint`, `bun test`: **passed**, 45 tests / 154 assertions.
- `bun run build`, `bunx cap sync android`: **passed**.
- Gradle `assembleDebug bundleRelease lintDebug testDebugUnitTest`: **passed**. Android lint reports existing template/resource warnings, with no errors. Android checks were run locally with Java 21 / SDK 36. The existing CI workflow is retained because the configured GitHub OAuth credential lacks workflow-update scope.

## Fixes

- [OAuthLoopbackPlugin.java](../../plugins/oauth-loopback/android/src/main/java/app/capgo/oauthloopback/OAuthLoopbackPlugin.java): fix NanoHTTPD's public `start()` override and bind the local listener only to `127.0.0.1`.
- [BrowserLayoutPlugin.java](../../android/app/src/main/java/app/capgo/browser/BrowserLayoutPlugin.java), [MainActivity.java](../../android/app/src/main/java/app/capgo/browser/MainActivity.java), [browser-controller.ts](../../src/browser/browser-controller.ts): measure the Android host WebView's screen origin in dp and offset native frames. Android plugin dimensions are dp, not raw pixels. Disable duplicate safe-area insets for framed Android pages and enable native history handling with the blank toolbar. iOS frame options remain unchanged.
- [keyboard.ts](../../src/ui/keyboard.ts), [browser-screen.ts](../../src/ui/browser-screen.ts), [styles.css](../../src/styles.css), [AndroidManifest.xml](../../android/app/src/main/AndroidManifest.xml): keep Android's native resize instead of subtracting keyboard height again; use the tab thumbnail while typing so the native dialog does not steal IME focus. Restore the live page on blur/back. Consume Capacitor's injected safe-area CSS variables and use `adjustResize`.
- [main.ts](../../src/main.ts), [app.ts](../../src/ui/app.ts), [browser-screen.ts](../../src/ui/browser-screen.ts): Android back dismisses sheets/tab overlays, traverses page history, and otherwise minimizes the app when the host owns Back. Visible native pages retain the plugin's normal Back behavior. External-link prompts can be shown again after Back dismisses one.
- [voice.ts](../../src/ui/voice.ts), [voice.test.ts](../../tests/voice.test.ts): accept Android's payload-free partial-results start acknowledgment instead of stopping dictation with a TypeError. Explicit RECORD_AUDIO permission and recognition-service visibility query are in the manifest.
- [oauth.ts](../../src/auth/oauth.ts), [oauth-parse.test.ts](../../tests/oauth-parse.test.ts): await event registration, use Android's Chrome UA, and match exact callback origin/path. The installed browser plugin already emits blocked URL events; no dependency patch is required.
- [app/build.gradle](../../android/app/build.gradle), [.gitignore](../../.gitignore): upload signing from environment/ignored properties, version 1 / 1.0.0, private credential/artifact exclusions. Android backup is disabled so auth/secret data is not restored onto another install.

## Emulator results

| Check | Result |
| --- | --- |
| Onboarding swipe | Passed: ADB swipe moved the track from 0 to -100%; Continue/Skip reached Connect |
| Connect / guest browsing | Passed: guest enters browser and loads HTTPS pages |
| ChatGPT sign-in launch | Passed: real OpenAI login page loaded, with email and provider options; cancellation returned to Connect |
| Blocked redirect handling | Passed: synthetic navigation to `http://127.0.0.1:1455/auth/callback` emitted the native event, reached the real `runAuthorizationInBrowser()`, validated state/client ID and closed the login view; no token exchange was attempted |
| Native page frame | Passed: page fills the intended area above chat; no duplicate status-bar gap; origin measured as y=51.8095 dp on WebView 133 |
| Tabs | Passed: two native pages, tab switch restores the selected page; Back closes tab switcher |
| Back | Passed: page navigation example.com → example.org → hardware Back returned to example.com; Back dismisses Menu and external-link sheet |
| Keyboard | Passed: real Android IME opens; viewport shrinks 839 → 527 CSS px; --kb remains 0; composer bottom equals viewport bottom; live page restored after keyboard Back |
| Collapsed chat pill | Passed: divider swipe collapses chat, the pill exists inside the native page, tapping it restores split view |
| External app links | Passed: a synthetic mailto link asks “Leave Auto Browse?” instead of launching another app; dismissed without sending anything |
| Voice | Passed: service available, microphone permission dialog displayed/granted, actual VoiceInput start remains listening with no initial error. Stopping an empty emulator recording yields “No match” and ends cleanly. Real spoken transcription is unverified (headless emulator has no audio input) |
| Export / FileProvider | Passed: Filesystem created `cache/exports/android-qa.csv`; Android Sharesheet displayed the filename and share targets. Canceled deliberately; no file was sent to a recipient |
| Secure storage | Passed: set/get/remove round-trip using a temporary test key |
| Signed release install | Passed: bundletool universal APK installed with the upload certificate, version 1 / 1.0.0 and no DEBUGGABLE package flag; onboarding, guest browsing and native HTTPS page frame smoke-tested |
| Capgo live updates | Passed: plugin loads and notifyAppReady marks builtin 1.0.0 successful. Server-delivered update download/activation was not exercised |

Evidence was captured with `adb exec-out screencap -p`, inspected, then converted to WebP:

- [Onboarding](verification/01-onboarding.webp)
- [OpenAI login](verification/04-oauth.webp)
- [Correct native frame](verification/07-frame-fixed.webp)
- [Tabs](verification/08-tabs.webp)
- [Keyboard layout](verification/11-keyboard.webp)
- [In-page chat pill](verification/12-collapsed-pill.webp)
- [External link confirmation](verification/13-external-confirmation.webp)
- [Export Sharesheet](verification/14-export-sharesheet.webp)
- [Microphone permission](verification/15-microphone-permission.webp)
- [Signed release browsing](verification/17-release-browser.webp)

## Release bundle

- Path: `store/android/auto-browse-1.0.0.aab` (ignored, local artifact).
- Upload alias: `autobrowse-upload`, RSA 4096.
- `jarsigner -verify`: **jar verified**. The self-signed upload certificate / absent timestamp warnings are expected. Java's streaming-JAR reader also warns about AGP bundle entry ordering; signing verification through the ZIP central directory succeeds.
- Certificate SHA-256: `97:2F:9F:36:45:D2:16:A5:17:BA:DC:BC:06:C4:86:C7:14:1B:D7:CA:E1:E0:13:DA:2D:FA:D3:8F:41:62:10:97`.
- AAB SHA-256: `530b1d2842f9deb94ac532bdba70be924f2484a98ae477f74aef296a3b0fb7e1`.
- Bundletool 1.18.3 `validate` passed and generated a universal APK set from this AAB. `apksigner verify` confirmed one signer with APK v2/v3 signatures; `zipalign -c -P 16 4` passed.
- No native `.so` libraries are packaged; no 16 KB ELF alignment remediation is needed.
- Keystore and passwords remain in `~/.capgo-credentials/`, mode 600; no credentials or reviewer password are tracked.

## Remaining checks / blockers

- **Publication blocker:** implement in-app reporting of offensive AI responses with a real receiving endpoint/form. No such endpoint exists in this repo; a URL was requested. [Google Play requires reporting without exiting the app](https://support.google.com/googleplay/android-developer/answer/13985936).
- Complete Play Console App access with the reviewer password and verify the demo account's plan and MFA access. A real ChatGPT sign-in, token issuance/refresh, authenticated agent actions and provider MFA were not tested.
- Finalize Data safety against OpenAI/Capgo processing terms and retention. Signing out/uninstalling deletes local data, not provider-side records; see [play-metadata.md](play-metadata.md).
- Physical-device voice dictation, password-manager autofill, OEM/older Android versions and remote Capgo bundle activation remain unverified. HTTPS App Links did not verify on the emulator (`capgo.app: 1024`); configure the domain association with the final Play app-signing certificate before relying on automatic link opening. iOS was not rebuilt or device-tested in this Android task.
- An extra diagnostic probe of speech plugin 8.4.1's `isOnDeviceRecognitionAvailable()` crashed because it constructs SpeechRecognizer off the main thread. The app does not call that API; the normal Android recognizer path was tested. Upgrade/fix that dependency before introducing an explicit offline-recognition preference.
- No Play Console upload or review submission was performed.
