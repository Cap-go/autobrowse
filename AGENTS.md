# iOS signing and TestFlight

- App Store Connect app: `6821215230`, bundle ID: `app.capgo.browser`, Apple team: `UVTJ336J2D`.
- Use `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`; the machine-wide Xcode selection may point to Command Line Tools.
- The existing Apple Distribution certificate and private key are in `$HOME/Library/Keychains/digitalshift-signing.keychain-db`. Its signing identity SHA-1 is `14C8765BDFC0503FF228CBC387DC5537079077C6`.
- The agent-created keychain password is stored in `$HOME/.appstoreconnect/ageverif-signing/keychain.password`. Unlock with `security unlock-keychain -p "$(cat "$HOME/.appstoreconnect/ageverif-signing/keychain.password")" "$HOME/Library/Keychains/digitalshift-signing.keychain-db"`.
- The certificate backup is `$HOME/.appstoreconnect/ageverif-signing/digitalshift-apple-distribution-2027-10.p12`; its password is in the adjacent `p12.password` file.
- Never print, commit, or paste password values or private keys. These locations are machine-local, not repository files. Check the saved signing credentials before asking the user for a password or a Keychain approval.
- When exporting, ensure the unlocked signing keychain is searched before other keychains containing the same identity. Preserve the original search list and restore it after export. Do not replace unrelated certificates or alter other projects' keychains.
- `asc auth status` reports the existing App Store Connect authentication. Use `asc builds list --app 6821215230` to choose an unused build number. TestFlight groups are `Capgo Team` (internal) and `Beta` (external). External distribution may require beta review; do not submit a production App Store release unless requested.
