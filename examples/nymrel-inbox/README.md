# Nymrel Inbox

Private capture and source-linked search for iOS and Android. MIT-licensed native source preview **0.1.0**.

Save notes, links, screenshots, PDFs, and voice recordings. Search locally and see the exact captured text with its page or time reference. Originals remain available even when extraction fails.

## Implemented

- Native React Native/Expo application with Library, Capture, Your Data, and recoverable Trash.
- On-device ranked text search, small explicit synonym expansion, deterministic tag suggestions, related captures, and highlighted source passages. This is lexical retrieval, not an evaluated semantic embedding model.
- iOS Vision OCR, PDFKit text extraction with OCR fallback, and support-gated on-device Speech transcription. PDF indexing is bounded to 20 pages; iOS audio extraction accepts recordings up to 120 seconds and requires a locally supported English recognizer.
- Android bundled Latin-script ML Kit OCR, PDF page rendering/OCR, and Vosk English audio-file transcription with word time references. The speech model is prepared and verified at build time, bundled in the APK, and unpacked locally with strict limits; app network access is not required. Audio extraction is bounded to 120 seconds and supported PCM16-decodable formats.
- iOS share extension that saves into an App Group and completes normally. It does not launch the main app. Open Inbox to import pending captures. Android receives raw share intents; URL metadata is never fetched.
- SQLCipher device database, random master key in SecureStore, AES-256-GCM attachment encryption, and password-encrypted full-original backups. Missing SQLCipher causes an explicit refusal rather than an unencrypted fallback.
- Backup validation before writes; transactional merge, preserved existing IDs, content/URL deduplication, checksum verification, and rollback cleanup.
- An optional model-adapter interface. No remote model client, cloud inference, account, advertising, or analytics integration is shipped. External adapters are not enabled by this release.

Reuse from Open Desk includes URL normalization that retains functional query bytes and obvious signed URLs, deterministic deduplication, bounded portable schemas, and recovery-oriented UI patterns. Original source files and tests are included.

## Development

Use Node **24.20+ within 24.x**, npm, and the platform's native development environment. The test harness uses Node's in-memory SQLite and native platform doubles; those tests are distinct from physical-device acceptance.

```sh
git clone https://github.com/nymrel/a2ui-warm-paper.git
cd a2ui-warm-paper/examples/nymrel-inbox
npm ci --ignore-scripts
npm run prepare:speech-model # downloads the pinned Apache-2.0 English model at build time
npm run check
npm run prebuild
npm run ios       # macOS with Xcode and CocoaPods
npm run android   # Android SDK and JDK 17
```

Expo Go cannot run this app's encryption and custom native extraction modules. Native project directories are generated and ignored; **the local module's Swift, Kotlin, podspec, and Gradle files are tracked**. Android production network permissions are blocked, so a normal Metro network development session needs a separately reviewed development configuration; the packaged review build includes its JS bundle.

`npm run export` validates native JavaScript bundling. The repository's Inbox workflow additionally attempts Android review compilation, release-manifest network checks, and unsigned iOS simulator compilation. A generated project or exported JS bundle alone does not establish a compiled native application, successful device extraction, signing, or store acceptance. Read the actual workflow results for this revision. Android review validation also checks the pinned bundled model, 16 KiB alignment of 64-bit ELF libraries, APK page alignment, and PCM resampling unit tests.

## Data and recovery

The database and long-term attachments are encrypted locally. The random device key uses the OS key store and is not included in backups. Losing it can make the local vault unreadable; use encrypted backups. Backup passphrases require at least 12 characters and cannot be recovered by Nymrel. Encryption is AES-256-GCM with PBKDF2-SHA256 at 600,000 iterations and fresh salt/nonce values for portable backups.

Backups include active captures and their original bytes. Trash is excluded. Import keeps existing records and skips collisions; it never replaces your current device key. Limits: 1,000 stored captures including Trash, 20 MiB per original, 100 MiB of originals, and 10 MiB searchable metadata. Empty Trash explicitly to free capacity. Purging permanently removes those app-owned records and encrypted originals.

Extraction and original-file viewing require temporary plaintext copies inside the app sandbox. Import/extraction copies are removed afterward. Viewer copies may be needed after handoff, so they are cleared on the next app activation/start. Failed unsaved recordings can be retried or explicitly discarded. The iOS App Group holds pending shares locally until successful encrypted import is acknowledged. This is not an app-lock/biometric feature or protection against an already compromised/unlocked device.

The app does not fetch saved URLs or send originals to a server. Opening a saved URL or deliberately sharing an original/backup hands it to another application. Android ML Kit has documented SDK diagnostics behavior; release network permissions are blocked and must be checked against the compiled merged manifest before distribution. No runtime network-isolation result is inferred from a source config alone.

## Release status and store material

This directory is an open-source preview, not evidence of an App Store or Google Play listing. EAS project ownership, signing, store records, privacy declarations, screenshots from real devices, encryption classification, and review acceptance require their actual account/device results. See [STORE_RELEASE.md](STORE_RELEASE.md) and [PRIVACY.md](PRIVACY.md).

The Expo toolchain's Zod dependency is pinned to patched 4.6.7 through an override and exercised by a compatibility regression. The current deepmerge advisory has no compatible published patch in the pinned SDK; its low-severity toolchain findings remain disclosed. No high/critical finding is waived by the release check.

## Primary references

- [Expo SQLCipher configuration and capability guard](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Expo sharing API and experimental iOS launch limitation](https://docs.expo.dev/versions/latest/sdk/sharing/)
- [Apple on-device speech requirement](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition)
- [Android bundled text recognition](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)
- [ML Kit Android data disclosures](https://developers.google.com/ml-kit/android-data-disclosure)

Application code: MIT, copyright 2026 Nymrel / JalenBuilds LLC. See [LICENSE](LICENSE). Vosk/JNA/model components retain their own licenses; see [third-party notices](modules/inbox-extractor/third-party/NOTICE.md).
