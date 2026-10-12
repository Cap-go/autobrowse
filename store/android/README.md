# Android release

Package `app.capgo.browser`, versionCode **1**, versionName **1.0.0**. The web/live-update package version is independent (`package.json`); do not reset the existing iOS/live-update version.

## Build

This checkout was built with Android SDK 36, build tools 36.0.0, Gradle 8.14.3, AGP 8.13.0 and Android Studio's Java 21 JBR. Minimum Android API is 24.

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
bun install --frozen-lockfile
bun run build
bunx cap sync android
./android/gradlew -p android assembleDebug
```

## Upload signing

Private files on the release machine:

- `~/.capgo-credentials/autobrowse-upload.jks`
- `~/.capgo-credentials/autobrowse-android.json` (alias, store password, key password; mode 600)
- Alias: `autobrowse-upload`; RSA 4096; JKS format.

Keep a secure backup of both private files. Neither belongs in git. Gradle reads these environment variables, with a fallback to the same keys in ignored `android/keystore.properties`:

```text
ANDROID_KEYSTORE_PATH
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Local signing properties have already been populated from the private JSON. Release bundle creation fails if the signing path is absent. To rebuild:

```sh
bun run build
bunx cap sync android
./android/gradlew -p android bundleRelease
mkdir -p store/android
cp android/app/build/outputs/bundle/release/app-release.aab store/android/auto-browse-1.0.0.aab
"$JAVA_HOME/bin/jarsigner" -verify store/android/auto-browse-1.0.0.aab
```

A self-signed upload certificate warning is expected. The AAB is signed by the upload key, not a debug key; enroll/use Google Play App Signing in Play Console. Keystores, signing properties, APKs and AABs are ignored by git. This app contains no native `.so` libraries; the Java/Kotlin app and dependencies support 16 KB page-size devices without ELF alignment changes ([Android guidance](https://developer.android.com/guide/practices/page-sizes)).

## Store assets

Start the dev server from the repo root, then run the headless store tools:

```sh
bunx vite --port 5179
# In another terminal, from store/tools:
bun install --frozen-lockfile
bun shoot-raw.mjs --android
bun frame.mjs --android
bun play-assets.mjs
```

Outputs: six `store/screenshots/android-phone/*.png` files, `store/android/feature-graphic.png`, and `store/android/icon-512.png`. Android screenshots use the same captions as iOS, an opaque #0e8f6e background, and no simulated iOS status bar/notch. The Play icon flattens the original app icon silhouette to white; there are no gradient or glow treatments. iOS output is unchanged when the Android flag is used.

## Verification and publication

See [verification.md](verification.md) for emulator results and remaining checks, and [play-metadata.md](play-metadata.md) for copy/paste listing, Data safety, IARC and reviewer access details. Supply the reviewer password only in Play Console App access. Nothing has been uploaded to Play Console or submitted for review by this task.
