# Apple creative assets

Flat #0e8f6e artwork for Auto Browse, with the existing icon silhouette and a capture of the app's demo chat UI. No gradients or glow shadows.

| Placement | File | Size | Alpha |
| --- | --- | --- | --- |
| Product page Header | `product-page-header-3840x1646.png` | 3840 × 1646 | None |
| Search Results | `search-results-3840x2560.png` | 3840 × 2560 | None |

WebP files are smaller previews. Upload the PNGs to Apple. `source-chat.png` is the headless capture used in Search Results.

Apple's [creative asset specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications) and [asset guidance](https://developer.apple.com/app-store/asset-best-practices/) were checked on 2026-10-13. The branding and chat panel fit inside the safe areas measured from Apple's Photoshop templates:

- Header: 1646 × 661, positioned at x=1097, y=493.
- Search Results: 2168 × 1030, positioned at x=836, y=765.

## App Store Connect draft

Uploaded and assigned through the App Store Connect API on 2026-10-13, then verified with fresh GET requests. [asc-draft.json](asc-draft.json) records asset IDs, placement IDs, SHA-256 checksums and the exact persisted states.

- App: Auto Browse, Apple ID `6821215230`, bundle `app.capgo.browser`.
- Version: `1.0.0`, English (U.S.), localization `708b30c8-8a08-4cae-a9e1-2c0c6ea7b00e`.
- Both images: `PREPARE_FOR_SUBMISSION`.
- Header and Search Results placements: `ACTIVE`, referencing the respective images.
- Nothing was submitted for review. No review submission was created or sent.
- The app version remains `REJECTED`; the creative assets are prepared, but the app's existing rejection still needs resolution before resubmission. The selected build is 19 and is valid. Reviewer credentials and contact details are present; no password was read into this repo or changed.

App Store Connect: [Asset Library](https://appstoreconnect.apple.com/apps/6821215230/distribution/asset-library).

## Regenerate

Start Vite from the repo root, then run the existing headless store tool:

```sh
bunx vite --port 5179
# In another terminal:
cd store/tools
bun install --frozen-lockfile
bun apple-assets.mjs
```

Regeneration only writes local artwork. It does not upload, assign or submit anything to Apple. If artwork changes, replace the draft assets in App Store Connect and refresh `asc-draft.json` after verifying the saved assignments.
