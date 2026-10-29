# Nymrel Inbox privacy description

This describes the current source preview. Final store declarations must match the actual distributed binary and its verified SDK behavior.

Nymrel Inbox stores captures, extracted text, tags, and original attachments on the user's device. It has no Nymrel server account or cloud synchronization service. On-device OCR and supported iOS Speech recognition process user-selected captures. Unsupported transcription preserves the original and reports the limitation; it does not fall back to a cloud recognizer.

The app requests microphone access only for a user-initiated voice recording, photo access through the system selection UI, and iOS Speech authorization when the user requests supported transcription. File selection and inbound shares are initiated by the user. These permissions may be declined; notes and links remain available.

Long-term database and attachment files are encrypted. Temporary app-sandbox files and pending iOS share-extension captures are needed before encryption or while viewing an original. The app removes those working copies according to the lifecycle documented in the README. Device encryption, OS access controls, and a private backup passphrase remain part of the user's protection.

Exports contain the user's saved data, encrypted with their chosen passphrase. Explicitly sharing an original, exporting a backup, or opening a saved website involves the application or destination selected by the user. Nymrel does not control those destinations.

The app contains Android ML Kit. Its public SDK disclosure describes diagnostic/device/app information. The release configuration blocks Android network permissions, and release verification checks the merged manifest. Store privacy answers must be based on the verified final binary, including third-party SDK behavior; source configuration is not a complete network test.

Users can move captures to Trash, restore them, or explicitly purge them. Purge removes the app-owned records and encrypted originals. Previously exported or shared copies remain wherever the user saved them. Deleting the app or losing the device key may make the vault inaccessible; encrypted backups allow recovery with the correct passphrase.

Maintainer contact: contact@nymrel.com. Source and issue tracker: https://github.com/nymrel/a2ui-warm-paper/.
