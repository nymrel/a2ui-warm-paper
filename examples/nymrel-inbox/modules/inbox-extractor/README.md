# Inbox Extractor

Local Expo module for Nymrel Inbox. No remote extraction API or cloud fallback is implemented.

## API

`capabilities()` returns `{ocr, pdf, audio, reason?}`. `extract(fileUri, mimeType, locale)` returns `{segments, truncated}`; segments retain one-based PDF pages or audio millisecond offsets. Empty recognition rejects with a useful message so the caller can retain the original and offer a manual note.

The extractor accepts only copied files inside the main app's private sandbox, with a 20 MiB file limit. Images are downsampled on iOS; Android rejects images above 16 megapixels. PDFs process at most 20 pages and 200,000 text characters. PDF extraction preserves the page number and marks a partial result `truncated`. iOS reads embedded PDF text first, then runs Vision on a rendered page. Android renders PDF pages locally and uses the bundled ML Kit Latin recognition model.

On iOS, audio transcription requires both system speech authorization and `supportsOnDeviceRecognition` for the requested locale. Requests set `requiresOnDeviceRecognition = true`. Audio is limited to 2 minutes and recognition times out after 90 seconds. Unsupported languages, denied permission, unreadable files and recognition errors do not trigger a network fallback.

Android file transcription uses Vosk 0.3.75, JNA 5.18.1, and the bundled `vosk-model-small-en-us-0.15` model. It currently accepts US English mono/stereo audio up to 2 minutes, sampled between 8 and 48 kHz. Android's local MediaExtractor/MediaCodec decodes supported file codecs to PCM16; the extractor downmixes and streams a linear resample to 16 kHz without retaining the complete decoded file. Unsupported codecs/PCM formats reject with an actionable error and keep the original. The implementation does not use Android's recognition intents or open the microphone for imported-file transcription.

Run `node scripts/prepare-speech-model.mjs` before Android prebuild, or pass `--source /path/to/vosk-model-small-en-us-0.15.zip` to reuse a local download. The helper accepts only the pinned SHA-256 in `speech-model.json`; it bounds downloads to 80 MiB and commits the ZIP atomically. The config plugin copies the verified ZIP into the APK's assets. The app performs no model download. Its first transcription verifies the bundled ZIP again, unpacks it within a 100 MiB / 128-entry private staging directory with canonical path checks, and commits the model only after required files are present. The model is excluded from Android backup storage.

The ZIP and generated native directories are build assets, not committed source. The official model URL, exact digest and license remain in the source manifest. See [third-party notices](third-party/NOTICE.md) for model/library attribution and artifact inspection evidence. The build plugin also copies the Apache license and speech-component notices into Android assets. The bundled model adds approximately 40 MiB compressed and about 68 MiB extracted; actual native runtime memory and recognition quality require device measurement.

Google documents that ML Kit processes recognition inputs on the device, but its SDK also has diagnostic/application/device data-disclosure requirements. Bundling the OCR model does not by itself establish that the complete Android app sends no telemetry. Use the final merged manifest, network observation and [Google's disclosure guidance](https://developers.google.com/ml-kit/android-data-disclosure) when completing the Play Data Safety form. Do not declare a device-tested privacy outcome from this source alone.

## Supported iOS sharing

The `plugins/with-inbox-sharing.cjs` app plugin must run after the configured `expo-sharing` plugin. It keeps the generated share-extension target, signing configuration and App Group setup, but replaces the generated controller with `InboxShareViewController.swift`. The custom controller stages captures and completes the extension request; it never launches the main app through an unsupported URL-opening technique.

Set the same App Group on expo-sharing and this plugin, for example `group.com.nymrel.inbox`. The plugin sets `InboxAppGroup` in both the main app and extension Info.plists. Register the App Group with the Apple developer account before signing. The extension accepts up to five providers at once; supported files are images, PDFs and audio up to 20 MiB, plus HTTP(S) URLs and plain text up to 200,000 UTF-8 bytes.

Each staged capture has a separate atomic metadata file and private attachment in the App Group directory. File protection is set to complete; these staged originals are not application-level encrypted until the main app imports them. `getSharedItems()` reads up to 100 pending records without removing them. The caller copies/commits the item into its encrypted store before calling `acknowledgeShared(id)`. If import fails or the app is closed, the pending source remains available for retry. Open Nymrel Inbox manually after sharing to process the queue.

## Verification boundary

Expo prebuild/autolinking and JavaScript type checking can validate the integration configuration. The share-plugin and speech-model helper tests run with Node. `MonoResamplerTest` exercises the actual Kotlin streaming resampler through the Android module's JVM unit-test task. Those checks do not prove speech-recognition quality, App Group permissions, OS share sheets, or real phone input. Xcode/Android builds and device acceptance remain necessary before a store-ready claim.

## Primary implementation references

- [Expo module API](https://docs.expo.dev/modules/module-api/) and [module config](https://docs.expo.dev/modules/module-config/).
- [Expo sharing](https://docs.expo.dev/versions/latest/sdk/sharing/), including its documented iOS share-extension caveat.
- [Apple on-device speech requirement](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition) and [support check](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition).
- [Google ML Kit bundled Android recognition](https://developers.google.com/ml-kit/vision/text-recognition/v2/android).

MIT, copyright 2026 Nymrel / JalenBuilds LLC.
