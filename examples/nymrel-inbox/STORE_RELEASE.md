# Native release record

App: Nymrel Inbox · version 0.1.0 · iOS `com.nymrel.inbox` · Android `com.nymrel.inbox`.

These identifiers are source configuration. Neither store's ownership or availability has been established by that configuration.

## Prepared copy

**Short description:** A private inbox for notes, screenshots, PDFs, links, and voice recordings.

**Description:** Save what matters and find its source again. Nymrel Inbox keeps captures on your device, searches their text, and shows matching passages with page or audio time references when available. Add notes and tags, find related captures, keep original files, and export password-encrypted backups. Recover deleted captures from Trash before purging them. Supported image/PDF extraction runs locally. Audio transcription availability varies by platform and device; Android audio originals support manual notes in this version.

## Actual remaining release gates

1. Verify the exact source revision's native workflow. Android artifacts use development/review signing, not a merchant's production signing key. iOS simulator compilation disables signing.
2. Run a physical iPhone and Android acceptance pass: cold start, SQLCipher capability, file OCR/PDF citations, unsupported-device recovery, share-extension queue, microphone denial, recording retry/discard, original viewing, backup on a second clean installation, Trash recovery, and airplane mode. Observe app behavior and the final binary's network traffic.
3. Authenticate the intended existing Expo/EAS owner. Check actual authentication before running a hosted build. Do not infer an account, project ID, or build quota from historical receipts. Register the app in the intended account only through the supported authenticated flow and record the returned EAS project ID.
4. Verify current build allowance before any hosted build. Prefer already-authorized local/native CI checks while signing is unavailable; no paid upgrade, build-credit purchase, or usage overage is authorized by this source release.
5. Establish Apple/Google store access, bundle/package ownership, signing/provisioning and any store-required agreements. Use the actual account's existing credential flow. Complete required legal/encryption/privacy decisions with the owner rather than inventing answers or accepting new terms automatically.
6. Add device screenshots, a public privacy-policy URL reflecting the final binary, support URL, accurate age/content ratings, accessibility details, and platform-specific privacy/data-safety answers. The repository privacy document is prepared copy, not proof that a store has accepted it.
7. Submit the signed exact build through the actual store account, then retain the submission receipt and review result. Source merge, CI success, an EAS upload, TestFlight availability, and public store release are separate outcomes.

## Build routes

The tracked EAS profiles support preview APK and production app-bundle/iOS builds. They intentionally contain no fabricated Expo project UUID, Apple team ID, App Store ID, Play service-account JSON, credentials, or signing material.

After account/project setup and allowance verification, the configured owner can run the supported EAS build and submit commands for this app. The native workflow supplies compiler evidence without consuming an EAS iOS build.
