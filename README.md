# capgo-browser

Mobile AI browser: sign in with ChatGPT, then an AI browses and acts for you. Built on capacitor-inappbrowser and capacitor-native-navigation.

## Purpose

A mobile browser app where the user signs in with their ChatGPT account and then asks, by voice or chat, for an AI to browse and act on their behalf. The AI sees the page, decides what to do, and drives the browser. The system password manager and autofill keep working like in a real browser.

## Planned architecture

- **App shell:** Capacitor 8 app (iOS and Android).
- **Auth:** Sign in with ChatGPT using OAuth with PKCE. The app is the only client, and ChatGPT is the only model provider.
- **Agent loop:** Responses API with function tools. The model calls tools that map to capacitor-inappbrowser methods (open URL, read page, click, type, scroll, screenshot, navigate back and forward, execute script).
- **Browser:** [capacitor-inappbrowser](https://github.com/Cap-go/capacitor-inappbrowser) for the web view, extended or wrapped by a custom plugin where needed.
- **Chrome and navigation:** [capacitor-native-navigation](https://github.com/Cap-go/capacitor-native-navigation) for native toolbars, tabs and transitions.
- **Token storage:** iOS Keychain and Android Keystore. Tokens never touch web storage or logs.
- **Input:** chat and voice.

## Main risk

OAuth loopback redirect on mobile. Sign in with ChatGPT flows are built around a loopback redirect (localhost callback), which is not directly available inside a mobile app. We need to validate options such as a custom URL scheme or universal link redirect, a small local listener inside the app, or a relay, and confirm what the provider accepts.

## Status

Planning. Nothing is implemented yet.
