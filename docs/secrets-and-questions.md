# Secrets and questions

## Secrets (passwords, one-time codes, card numbers)

The model never sees secret values.

1. The agent calls `request_secret({ name, label, kind, reason })` (namespace `capgo_user`).
2. The chat shows a secure card (masked input, iOS Passwords AutoFill via
   `autocomplete`, optional "Remember on this device"). The value goes to
   `src/secrets/vault.ts`: memory for the session, Keychain/Keystore when remembered.
   It is never added to the chat or to the model history.
3. The model receives only `{ ok: true, secret: "secret:<name>" }`.
4. The agent calls `browser_fill_secret({ secret, x, y | selector })`. The app
   injects the value with the native value setter (React/Vue friendly).

Guards:

- A secret is bound to the site it was requested on (`github.com` also covers
  `auth.github.com`, never `github.com.evil.io`). Filling elsewhere is refused.
- `browser_read_dom` never reads values of password / one-time-code / card fields.
- Every tool output is passed through `vault.redact()` before reaching the model,
  so a page echoing a secret back sends `[REDACTED secret:<name>]`.
- Instructions tell the model never to ask for secrets in chat or type them itself.
- Settings → Passwords & secrets lists remembered entries (name + site) and deletes them.

Tests: `tests/secrets.test.ts`, "secrets and questions" in `tests/agent-loop.test.ts`
(asserts the value never appears in any model request).

## Questions

`ask_user({ question, options?, allow_free_text? })` shows a card with suggested
answers, a free-text field and Skip. The tool returns `{ answer }` or
`{ skipped: true }`. Stop cancels a pending card.
