import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as FS from "expo-file-system/legacy";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Linking, Platform } from "react-native";
import { base64, hex } from "@scure/base";
import {
  assetMetadata,
  makeItem,
  validateItem,
  validateArchive,
  contentFingerprint,
  MAX_FILE_BYTES,
  MAX_ITEMS,
  MAX_ARCHIVE_ASSET_BYTES,
} from "./core";
import type { Item, Archive, Segment } from "./core";
import {
  sealBytes,
  openBytes,
  encryptBackup,
  decryptBackup,
  MAX_BACKUP_ENVELOPE_BYTES,
} from "./crypto";
import Extractor from "../modules/inbox-extractor";

const DB_NAME = "nymrel-inbox-v1.db",
  KEY_NAME = "nymrel.inbox.master-key.v1";
let db: SQLite.SQLiteDatabase | null = null,
  key: Uint8Array | null = null,
  opening: Promise<void> | null = null;
let tail: Promise<unknown> = Promise.resolve();
const random = (length: number) => Crypto.getRandomBytes(length);
const root = () => {
  if (!FS.documentDirectory)
    throw new Error("Local document storage is unavailable.");
  return FS.documentDirectory + "inbox-v1/";
};
const temp = () => {
  if (!FS.cacheDirectory)
    throw new Error("Local temporary storage is unavailable.");
  return FS.cacheDirectory + "inbox-preview/";
};
const assetPath = (id: string) => root() + id + ".sealed";
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
function ready() {
  if (!db || !key) throw new Error("Open the encrypted vault first.");
  return { db, key };
}
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.then(async () => {
    await openVault();
    return operation();
  });
  tail = result.catch(() => undefined);
  return result;
}
async function cleanupTemp() {
  const dir = temp();
  await FS.deleteAsync(dir, { idempotent: true });
  await FS.makeDirectoryAsync(dir, { intermediates: true });
}
export async function openVault(): Promise<void> {
  if (db && key) return;
  if (opening) return opening;
  opening = (async () => {
    if (Platform.OS === "web")
      throw new Error(
        "Nymrel Inbox requires a native iOS or Android build for encrypted device storage.",
      );
    const dbUri =
      String(SQLite.defaultDatabaseDirectory).replace(/\/$/, "") +
      "/" +
      DB_NAME;
    const info = await FS.getInfoAsync(dbUri);
    let stored = await SecureStore.getItemAsync(KEY_NAME);
    if (!stored && info.exists)
      throw new Error(
        "This vault exists but its device key is missing. Restore your encrypted backup in a fresh installation; existing data has been left untouched.",
      );
    if (!stored) {
      stored = hex.encode(random(32));
      await SecureStore.setItemAsync(KEY_NAME, stored, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
    if (!/^[a-f0-9]{64}$/i.test(stored))
      throw new Error(
        "The saved vault key is invalid. Existing files have been left untouched.",
      );
    const connection = await SQLite.openDatabaseAsync(DB_NAME);
    try {
      const cipher = await connection.getFirstAsync<{ cipher_version: string }>(
        "PRAGMA cipher_version",
      );
      if (!cipher?.cipher_version)
        throw new Error(
          "This build has no SQLCipher encryption. Install the native Nymrel Inbox development or release build; Expo Go cannot open this vault.",
        );
      await connection.execAsync(
        `PRAGMA key = "x'${stored}'"; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`,
      );
      await connection.execAsync(
        "CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY NOT NULL, fingerprint TEXT UNIQUE NOT NULL, payload TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);",
      );
      await FS.makeDirectoryAsync(root(), { intermediates: true });
      await cleanupTemp();
      // A crash before a database commit can leave encrypted orphan files, never plaintext originals.
      const ids = new Set(
        (
          await connection.getAllAsync<{ id: string }>(
            "SELECT id FROM captures",
          )
        ).map((row) => row.id),
      );
      for (const name of await FS.readDirectoryAsync(root()))
        if (name.endsWith(".sealed") && !ids.has(name.slice(0, -7)))
          await FS.deleteAsync(root() + name, { idempotent: true });
      key = hex.decode(stored);
      db = connection;
    } catch (error) {
      await connection.closeAsync();
      throw error;
    }
  })();
  try {
    await opening;
  } finally {
    opening = null;
  }
}
async function rows(includeTrash = false): Promise<Item[]> {
  const { db } = ready();
  return (
    await db.getAllAsync<{ payload: string }>(
      "SELECT payload FROM captures" +
        (includeTrash ? "" : " WHERE deleted = 0") +
        " ORDER BY rowid DESC",
    )
  ).map((row) => validateItem(JSON.parse(row.payload)));
}
export function listItems() {
  return serial(() => rows());
}
export function listTrash() {
  return serial(async () => {
    const { db } = ready();
    return (
      await db.getAllAsync<{ payload: string }>(
        "SELECT payload FROM captures WHERE deleted = 1 ORDER BY rowid DESC",
      )
    ).map((row) => validateItem(JSON.parse(row.payload)));
  });
}
async function capacity(added: Item[], replacing?: string) {
  const all = [
    ...(await rows(true)).filter((item) => item.id !== replacing),
    ...added,
  ];
  if (all.length > MAX_ITEMS)
    throw new Error(
      "The vault supports 1,000 captures. Empty trash or remove old captures before adding more.",
    );
  if (
    all.reduce((sum, item) => sum + (item.asset?.size || 0), 0) >
    MAX_ARCHIVE_ASSET_BYTES
  )
    throw new Error(
      "The vault supports 100 MB of originals. Export and remove old captures before adding more.",
    );
  if (new TextEncoder().encode(JSON.stringify(all)).length > 10 * 1024 * 1024)
    throw new Error(
      "Searchable metadata has reached its 10 MB limit. Export and remove old captures.",
    );
}
async function existing(item: Item): Promise<Item | null> {
  const { db } = ready();
  const found = await db.getFirstAsync<{ payload: string; deleted: number }>(
    "SELECT payload, deleted FROM captures WHERE fingerprint = ?",
    contentFingerprint(item),
  );
  if (!found) return null;
  const original = validateItem(JSON.parse(found.payload));
  if (found.deleted)
    await db.runAsync(
      "UPDATE captures SET deleted = 0 WHERE id = ?",
      original.id,
    );
  return original;
}
async function insert(item: Item, bytes: Uint8Array | null) {
  const { db, key } = ready();
  let written = false;
  try {
    if (bytes) {
      const encrypted = sealBytes(bytes, key, random);
      await FS.writeAsStringAsync(
        assetPath(item.id),
        JSON.stringify(encrypted),
      );
      written = true;
    }
    await db.runAsync(
      "INSERT INTO captures (id,fingerprint,payload) VALUES (?,?,?)",
      item.id,
      contentFingerprint(item),
      JSON.stringify(item),
    );
  } catch (error) {
    if (written) await FS.deleteAsync(assetPath(item.id), { idempotent: true });
    throw error;
  }
}
export function saveNote(input: {
  title: string;
  notes: string;
  url?: string;
}) {
  return serial(async () => {
    const item = makeItem(
      { kind: input.url?.trim() ? "link" : "note", ...input },
      { id: Crypto.randomUUID() },
    );
    const found = await existing(item);
    if (found) return { item: found, duplicate: true };
    await capacity([item]);
    await insert(item, null);
    return { item };
  });
}
function checkLocalUri(uri: string) {
  if (!/^(file|content):\/\//.test(uri))
    throw new Error(
      "Import an original from the device file picker or share sheet. Network file URLs are not fetched.",
    );
}
function isCacheFile(uri: string): boolean {
  if (!FS.cacheDirectory) return false;
  try {
    const file = new URL(decodeURIComponent(uri));
    const cache = new URL(decodeURIComponent(FS.cacheDirectory));
    return (
      file.protocol === "file:" &&
      !file.host &&
      !file.search &&
      !file.hash &&
      file.href.startsWith(
        cache.href.endsWith("/") ? cache.href : cache.href + "/",
      )
    );
  } catch {
    return false;
  }
}
export async function cleanupPickerCopy(uri: string): Promise<void> {
  if (isCacheFile(uri)) await FS.deleteAsync(uri, { idempotent: true });
}
export async function discardTemporaryFile(uri: string): Promise<void> {
  if (!isCacheFile(uri))
    throw new Error("Only temporary files in this app cache can be discarded.");
  await FS.deleteAsync(uri, { idempotent: true });
}
function kindFor(mime: string, name: string): Item["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  throw new Error(
    "Choose an image, PDF, or audio file. Plain text can be pasted as a note.",
  );
}
function safeName(name: string) {
  const cleaned = name.replace(/[\/\\\x00-\x1f]/g, "_").slice(0, 180);
  return cleaned || "capture";
}
async function extractFile(
  uri: string,
  mime: string,
): Promise<{ segments: Segment[]; warning?: string }> {
  if (!Extractor)
    return {
      segments: [],
      warning:
        "The original was saved. On-device extraction needs the native Nymrel Inbox build.",
    };
  try {
    const result = await Extractor.extract(uri, mime, "en-US");
    return {
      segments: result.segments,
      warning: result.truncated
        ? "Only the first 20 pages or bounded recording window was indexed; the complete original is preserved."
        : result.segments.length
          ? undefined
          : "The original was saved, but no readable text was found. Add a note or retry extraction.",
    };
  } catch (error) {
    return {
      segments: [],
      warning: "The original was saved. " + errorText(error),
    };
  }
}
export function captureFile(input: {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}) {
  return serial(async () => {
    checkLocalUri(input.uri);
    if (input.size !== undefined && input.size > MAX_FILE_BYTES)
      throw new Error("Each original must be no larger than 20 MB.");
    const name = safeName(input.name),
      kind = kindFor(input.mimeType, name);
    const mimeType =
      kind === "pdf" ? "application/pdf" : input.mimeType.toLowerCase();
    const copied = temp() + Crypto.randomUUID() + "-" + name;
    try {
      await FS.copyAsync({ from: input.uri, to: copied });
      const info = await FS.getInfoAsync(copied);
      if (
        !info.exists ||
        info.isDirectory ||
        !info.size ||
        info.size > MAX_FILE_BYTES
      )
        throw new Error("Choose a nonempty original no larger than 20 MB.");
      const bytes = base64.decode(
        await FS.readAsStringAsync(copied, {
          encoding: FS.EncodingType.Base64,
        }),
      );
      try {
        const asset = assetMetadata(name, mimeType, bytes);
        let item = makeItem(
          { kind, title: name, asset },
          { id: Crypto.randomUUID() },
        );
        const found = await existing(item);
        if (found) return { item: found, duplicate: true };
        const extracted = await extractFile(copied, mimeType);
        item = validateItem({ ...item, segments: extracted.segments });
        await capacity([item]);
        await insert(item, bytes);
        return { item, warning: extracted.warning };
      } finally {
        bytes.fill(0);
      }
    } finally {
      await FS.deleteAsync(copied, { idempotent: true });
    }
  });
}
export function updateItem(value: Item) {
  return serial(async () => {
    const item = validateItem(value),
      { db } = ready();
    const row = await db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM captures WHERE id = ? AND deleted = 0",
      item.id,
    );
    if (!row) throw new Error("Capture no longer exists.");
    const original = validateItem(JSON.parse(row.payload));
    for (const field of [
      "kind",
      "url",
      "createdAt",
      "asset",
      "segments",
    ] as const)
      if (JSON.stringify(item[field]) !== JSON.stringify(original[field]))
        throw new Error(
          "Original source fields cannot be changed. Edit the title, notes, or tags instead.",
        );
    await capacity([item], item.id);
    await db.runAsync(
      "UPDATE captures SET payload = ?, fingerprint = ? WHERE id = ?",
      JSON.stringify(item),
      contentFingerprint(item),
      item.id,
    );
  });
}
export function trashItem(id: string) {
  return serial(async () => {
    await ready().db.runAsync(
      "UPDATE captures SET deleted = 1 WHERE id = ?",
      id,
    );
  });
}
export function restoreItem(id: string) {
  return serial(async () => {
    await ready().db.runAsync(
      "UPDATE captures SET deleted = 0 WHERE id = ?",
      id,
    );
  });
}
export function purgeTrash() {
  return serial(async () => {
    const { db } = ready();
    const removed = await db.getAllAsync<{ id: string }>(
      "SELECT id FROM captures WHERE deleted = 1",
    );
    await db.runAsync("DELETE FROM captures WHERE deleted = 1");
    for (const row of removed)
      await FS.deleteAsync(assetPath(row.id), { idempotent: true });
    return removed.length;
  });
}
async function originalBytes(item: Item) {
  if (!item.asset) throw new Error("This capture has no attached original.");
  const { key } = ready();
  const bytes = openBytes(
    JSON.parse(await FS.readAsStringAsync(assetPath(item.id))),
    key,
  );
  const meta = assetMetadata(item.asset.name, item.asset.mimeType, bytes);
  if (meta.sha256 !== item.asset.sha256 || meta.size !== item.asset.size) {
    bytes.fill(0);
    throw new Error("Original file integrity check failed.");
  }
  return bytes;
}
export function openOriginal(item: Item) {
  return serial(async () => {
    if (item.kind === "link") {
      await Linking.openURL(item.url);
      return;
    }
    if (!item.asset) throw new Error("The note text is its original source.");
    const bytes = await originalBytes(item);
    const file = temp() + Crypto.randomUUID() + "-" + safeName(item.asset.name);
    try {
      await FS.writeAsStringAsync(file, base64.encode(bytes), {
        encoding: FS.EncodingType.Base64,
      });
      await File.preview(new File(file), {
        mimeType: item.asset.mimeType,
        title: item.title,
      });
    } finally {
      bytes.fill(0);
    } /* Viewer may still need the file after preview resolves. Cleared on next app activation. */
  });
}
export function retryExtraction(item: Item) {
  return serial(async () => {
    if (!item.asset)
      throw new Error("This capture does not need file extraction.");
    const bytes = await originalBytes(item);
    const uri = temp() + Crypto.randomUUID() + "-" + safeName(item.asset.name);
    try {
      await FS.writeAsStringAsync(uri, base64.encode(bytes), {
        encoding: FS.EncodingType.Base64,
      });
      const result = await extractFile(uri, item.asset.mimeType);
      if (result.segments.length) {
        const updated = validateItem({ ...item, segments: result.segments });
        await capacity([updated], item.id);
        await ready().db.runAsync(
          "UPDATE captures SET payload = ? WHERE id = ?",
          JSON.stringify(updated),
          item.id,
        );
        return { item: updated, warning: result.warning };
      }
      return { item, warning: result.warning };
    } finally {
      bytes.fill(0);
      await FS.deleteAsync(uri, { idempotent: true });
    }
  });
}
export async function getCapabilities() {
  return Extractor
    ? await Extractor.capabilities()
    : {
        ocr: false,
        pdf: false,
        audio: false,
        reason:
          "On-device extraction needs a native build. Expo Go is not supported.",
      };
}
export function exportBackup(password: string) {
  return serial(async () => {
    const archive: Archive = { version: 1, items: [] };
    for (const item of await rows()) {
      let bytes: Uint8Array | null = null;
      try {
        bytes = item.asset ? await originalBytes(item) : null;
        archive.items.push({
          item,
          assetBase64: bytes ? base64.encode(bytes) : null,
        });
      } finally {
        bytes?.fill(0);
      }
    }
    const envelope = await encryptBackup(archive, password, random);
    const uri = temp() + "nymrel-inbox-" + Date.now() + ".inbox.json";
    try {
      await FS.writeAsStringAsync(uri, JSON.stringify(envelope));
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        dialogTitle: "Save encrypted Inbox backup",
      });
    } finally {
      await FS.deleteAsync(uri, { idempotent: true });
    }
  });
}
export async function importBackup(password: string) {
  const chosen = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "application/octet-stream"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (chosen.canceled) return { added: 0, skipped: 0 };
  return serial(async () => {
    const selected = chosen.assets[0];
    if (
      selected.size !== undefined &&
      selected.size > MAX_BACKUP_ENVELOPE_BYTES
    )
      throw new Error("Encrypted backup is too large.");
    const info = await FS.getInfoAsync(selected.uri);
    if (
      !info.exists ||
      info.isDirectory ||
      info.size > MAX_BACKUP_ENVELOPE_BYTES
    )
      throw new Error("Encrypted backup is too large or unavailable.");
    const archive = validateArchive(
      await decryptBackup(await FS.readAsStringAsync(selected.uri), password),
    );
    const { db } = ready();
    const originals = await rows(true);
    const ids = new Set(originals.map((i) => i.id)),
      fingerprints = new Set(originals.map(contentFingerprint));
    const added = archive.items.filter((entry) => {
      const fp = contentFingerprint(entry.item);
      if (ids.has(entry.item.id) || fingerprints.has(fp)) return false;
      ids.add(entry.item.id);
      fingerprints.add(fp);
      return true;
    });
    await capacity(added.map((e) => e.item));
    const written: string[] = [];
    await db.execAsync("BEGIN IMMEDIATE");
    try {
      for (const entry of added) {
        const bytes = entry.assetBase64
          ? base64.decode(entry.assetBase64)
          : null;
        try {
          await insert(entry.item, bytes);
          written.push(entry.item.id);
        } finally {
          bytes?.fill(0);
        }
      }
      await db.execAsync("COMMIT");
    } catch (error) {
      await db.execAsync("ROLLBACK");
      for (const id of written)
        await FS.deleteAsync(assetPath(id), { idempotent: true });
      throw error;
    }
    return {
      added: added.length,
      skipped: archive.items.length - added.length,
    };
  }).finally(async () => {
    const uri = chosen.assets[0].uri;
    if (FS.cacheDirectory && uri.startsWith(FS.cacheDirectory)) {
      await FS.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    }
  });
}
let shareWork: Promise<{ added: number; warnings: string[] }> | null = null;
export function processSharedItems() {
  if (shareWork) return shareWork;
  shareWork = (async () => {
    await serial(cleanupTemp);
    let added = 0;
    const warnings: string[] = [];
    if (Platform.OS === "ios" && Extractor) {
      for (const payload of await Extractor.getSharedItems()) {
        try {
          const result = payload.uri
            ? await captureFile({
                uri: payload.uri,
                name: payload.name || "Shared original",
                mimeType: payload.mimeType || "application/octet-stream",
              })
            : await saveNote({
                title: (payload.url || payload.text || "Shared note").slice(
                  0,
                  100,
                ),
                notes: payload.text || "",
                url: payload.url,
              });
          if (!result.duplicate) added++;
          if (
            "warning" in result &&
            typeof result.warning === "string" &&
            result.warning
          )
            warnings.push(result.warning);
          await Extractor.acknowledgeShared(payload.id);
        } catch (error) {
          warnings.push(errorText(error));
        }
      }
    }
    if (Platform.OS === "android") {
      let complete = true;
      for (const payload of Sharing.getSharedPayloads()) {
        try {
          const value = payload.value || "",
            type = payload.shareType || "text";
          let result;
          if (type === "url")
            result = await saveNote({
              title: value.slice(0, 100),
              notes: "",
              url: value,
            });
          else if (type === "text")
            result = await saveNote({
              title: value.slice(0, 100) || "Shared note",
              notes: value,
              ...(/^https?:\/\/\S+$/.test(value) ? { url: value } : {}),
            });
          else
            result = await captureFile({
              uri: value,
              name: value.split("/").pop() || "Shared original",
              mimeType: payload.mimeType || "application/octet-stream",
            });
          if (!["url", "text"].includes(type)) {
            await cleanupPickerCopy(value).catch(() =>
              warnings.push(
                "An imported shared-file cache copy could not be removed.",
              ),
            );
          }
          if (!result.duplicate) added++;
          if (
            "warning" in result &&
            typeof result.warning === "string" &&
            result.warning
          )
            warnings.push(result.warning);
        } catch (error) {
          complete = false;
          warnings.push(errorText(error));
        }
      }
      if (complete) Sharing.clearSharedPayloads();
    }
    return { added, warnings };
  })();
  return shareWork.finally(() => {
    shareWork = null;
  });
}
