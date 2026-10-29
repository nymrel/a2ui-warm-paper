# Offline speech components

Nymrel Inbox's own source is MIT licensed. The Android speech implementation links these separately licensed components without modifying their upstream sources:

| Component | Version/source | License |
| --- | --- | --- |
| Vosk Android | `com.alphacephei:vosk-android:0.3.75@aar`; [upstream](https://github.com/alphacep/vosk-api) | Apache-2.0 |
| Java Native Access | `net.java.dev.jna:jna:5.18.1@aar`; [upstream](https://github.com/java-native-access/jna) | Apache-2.0 selected from upstream's Apache-2.0 OR LGPL-2.1-or-later dual license |
| US English model | `vosk-model-small-en-us-0.15`; [official model list and license](https://alphacephei.com/vosk/models) | Apache-2.0 |

A copy of the [Apache License, Version 2.0](Apache-2.0.txt) is included here. Preserve the respective upstream notices when distributing the libraries/model. The model remains an unmodified build-bundled third-party asset; its official URL and pinned SHA-256 are in `../speech-model.json`. No recognition benchmark or accuracy claim is made for Nymrel Inbox.

## Artifact inspection, October 29, 2026 UTC

The downloaded Maven Central AARs had these SHA-256 values:

- Vosk: `ab2f8b91ac8051561aa325546b35fed9a68b36b8121bac5c6fb927525c4adfad`.
- JNA: `7f053e3ec99e14dd71259c82c1c8a02738d64a13c31226b2acc170f3060951e0`.

Actual ELF `PT_LOAD` headers inside the artifacts were inspected. Vosk's `arm64-v8a` and `x86_64` shared libraries have 16,384-byte segment alignment; its 32-bit `armeabi-v7a` and `x86` libraries have 4,096-byte alignment. JNA's packaged shared libraries have 16,384-byte segment alignment. This checks those library bytes only. It is not final APK ZIP-alignment verification, a native build, a 16 KiB-device runtime result, or store acceptance.

The model ZIP is 41,205,931 bytes, with SHA-256 `30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498`. Its official model-list row identifies the model as Apache 2.0. The original archive contains 20 entries totaling 70,898,967 expanded bytes.
