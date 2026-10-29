import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { randomBytes } from "node:crypto";
import { base64 } from "@scure/base";
import { assetMetadata, makeItem } from "./core.ts";
import type { Archive } from "./core.ts";
import { encryptBackup, decryptBackup } from "./crypto.ts";
import { mock, sourceFor } from "../tests/native-mocks.mjs";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = sourceFor(specifier);
    if (source)
      return {
        url: "data:text/javascript," + encodeURIComponent(source),
        shortCircuit: true,
      };
    if (["./core", "./crypto"].includes(specifier) && context.parentURL)
      return {
        url: new URL(specifier + ".ts", context.parentURL).href,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
let instance = 0;
async function service(): Promise<typeof import("./service")> {
  mock.reset();
  return await import(
    new URL(`./service.ts?test=${++instance}`, import.meta.url).href
  );
}
const random = (length: number) => new Uint8Array(randomBytes(length));
const password = "a private backup passphrase";
const sourceUri = "file:///incoming/receipt.png";
const sourceBytes = new TextEncoder().encode("Receipt warranty original bytes");
function filesAt(prefix: string) {
  return [...mock.files.keys()].filter((key: string) => key.startsWith(prefix));
}
function selectedBackup(text: string) {
  const uri = "file:///cache/imported.inbox.json";
  mock.put(uri, text);
  mock.selected = {
    uri,
    size: new TextEncoder().encode(text).length,
    name: "imported.inbox.json",
  };
  return uri;
}

test("SQLCipher capability guard refuses a plaintext-capable build (mocked native capability)", async () => {
  const app = await service();
  mock.cipherAvailable = false;
  await assert.rejects(() => app.openVault(), /no SQLCipher/);
  assert.equal(mock.closeCount, 1);
  assert.equal(filesAt("file:///docs/inbox-v1/").length, 0);
});
test("existing vault with a missing device key is preserved instead of reset", async () => {
  const app = await service();
  mock.put("file:///db/nymrel-inbox-v1.db", "existing encrypted database");
  await assert.rejects(() => app.openVault(), /device key is missing/);
  assert.equal(
    new TextDecoder().decode(mock.get("file:///db/nymrel-inbox-v1.db")),
    "existing encrypted database",
  );
  assert.equal(mock.secure.size, 0);
});
test("file capture stores ciphertext, preserves the original, and cleans its plaintext import copy", async () => {
  const app = await service();
  mock.put(sourceUri, sourceBytes);
  const saved = await app.captureFile({
    uri: sourceUri,
    name: "receipt.png",
    mimeType: "image/png",
    size: sourceBytes.length,
  });
  assert.equal((await app.listItems()).length, 1);
  assert.equal(saved.item.segments[0]!.text, "Receipt warranty source text");
  const sealed = filesAt("file:///docs/inbox-v1/");
  assert.equal(sealed.length, 1);
  const stored = new TextDecoder().decode(mock.get(sealed[0]));
  assert.ok(stored.includes("AES-256-GCM"));
  assert.ok(!stored.includes("Receipt warranty original bytes"));
  assert.equal(filesAt("file:///cache/inbox-preview/").length, 0);
  await app.openOriginal(saved.item);
  assert.deepEqual(mock.previews[0].bytes, sourceBytes);
  await app.processSharedItems();
  assert.equal(filesAt("file:///cache/inbox-preview/").length, 0);
});
test("duplicate import returns the existing record without replacing its encrypted original", async () => {
  const app = await service();
  mock.put(sourceUri, sourceBytes);
  const first = await app.captureFile({
    uri: sourceUri,
    name: "receipt.png",
    mimeType: "image/png",
  });
  const file = filesAt("file:///docs/inbox-v1/")[0];
  const before = new Uint8Array(mock.get(file));
  const duplicate = await app.captureFile({
    uri: sourceUri,
    name: "renamed.png",
    mimeType: "image/png",
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.item.id, first.item.id);
  assert.equal(duplicate.item.title, "receipt.png");
  assert.deepEqual(mock.get(file), before);
  assert.equal(filesAt("file:///docs/inbox-v1/").length, 1);
});
test("edited notes retain correct deduplication fingerprints", async () => {
  const app = await service();
  const first = await app.saveNote({
    title: "First title",
    notes: "Original note content",
  });
  await app.updateItem({ ...first.item, notes: "Edited note content" });
  const edited = await app.saveNote({
    title: "Second title",
    notes: "Edited note content",
  });
  assert.equal(edited.duplicate, true);
  assert.equal(edited.item.id, first.item.id);
  const original = await app.saveNote({
    title: "Original again",
    notes: "Original note content",
  });
  assert.ok(!original.duplicate);
  assert.notEqual(original.item.id, first.item.id);
  assert.equal((await app.listItems()).length, 2);
});
test("a note edit cannot replace another capture through a fingerprint collision", async () => {
  const app = await service();
  const first = await app.saveNote({
    title: "First",
    notes: "First private note",
  });
  await app.saveNote({ title: "Second", notes: "Second private note" });
  await assert.rejects(() =>
    app.updateItem({ ...first.item, notes: "Second private note" }),
  );
  assert.deepEqual(
    new Set((await app.listItems()).map((item) => item.notes)),
    new Set(["First private note", "Second private note"]),
  );
});
test("PDF files shared with a generic MIME retain a usable PDF original", async () => {
  const app = await service();
  const uri = "file:///incoming/document.pdf";
  mock.put(uri, new TextEncoder().encode("%PDF-1.7 test fixture"));
  const saved = await app.captureFile({
    uri,
    name: "document.pdf",
    mimeType: "application/octet-stream",
  });
  assert.equal(saved.item.kind, "pdf");
  assert.equal(saved.item.asset!.mimeType, "application/pdf");
});
test("a modified encrypted original is rejected before creating a plaintext preview", async () => {
  const app = await service();
  mock.put(sourceUri, sourceBytes);
  const saved = await app.captureFile({
    uri: sourceUri,
    name: "receipt.png",
    mimeType: "image/png",
  });
  const path = filesAt("file:///docs/inbox-v1/")[0]!;
  const envelope = JSON.parse(new TextDecoder().decode(mock.get(path)));
  const ciphertext = base64.decode(envelope.ciphertext);
  ciphertext[0]! ^= 1;
  envelope.ciphertext = base64.encode(ciphertext);
  mock.put(path, JSON.stringify(envelope));
  await assert.rejects(() => app.openOriginal(saved.item), /decrypt/);
  assert.equal(mock.previews.length, 0);
  assert.equal(filesAt("file:///cache/inbox-preview/").length, 0);
});
test("trash is recoverable and permanently purged originals are removed", async () => {
  const app = await service();
  mock.put(sourceUri, sourceBytes);
  const saved = await app.captureFile({
    uri: sourceUri,
    name: "receipt.png",
    mimeType: "image/png",
  });
  await app.trashItem(saved.item.id);
  assert.equal((await app.listItems()).length, 0);
  assert.equal((await app.listTrash()).length, 1);
  await app.restoreItem(saved.item.id);
  assert.equal((await app.listItems()).length, 1);
  await app.trashItem(saved.item.id);
  assert.equal(await app.purgeTrash(), 1);
  assert.equal((await app.listTrash()).length, 0);
  assert.equal(filesAt("file:///docs/inbox-v1/").length, 0);
});
test("unavailable extraction keeps original bytes and clearly reports the limitation", async () => {
  const app = await service();
  mock.put(sourceUri, sourceBytes);
  mock.extraction = new Error("On-device speech or OCR unavailable");
  const saved = await app.captureFile({
    uri: sourceUri,
    name: "receipt.png",
    mimeType: "image/png",
  });
  assert.equal(saved.item.segments.length, 0);
  assert.match(saved.warning!, /original was saved/);
  assert.equal(filesAt("file:///cache/inbox-preview/").length, 0);
  await assert.rejects(
    () =>
      app.captureFile({
        uri: "https://example.com/receipt.png",
        name: "receipt.png",
        mimeType: "image/png",
      }),
    /Network file URLs/,
  );
});
test("invalid backup import is atomic and leaves existing captures untouched", async () => {
  const app = await service();
  const saved = await app.saveNote({
    title: "Keep this",
    notes: "An existing private note",
  });
  const before = await app.listItems();
  const selected = selectedBackup("{invalid");
  await assert.rejects(() => app.importBackup(password), /valid JSON/);
  assert.deepEqual(await app.listItems(), before);
  assert.equal((await app.listItems())[0]!.id, saved.item.id);
  assert.ok(
    !mock.files.has(selected),
    "temporary picker copy should be cleaned after rejection",
  );
});
test("backup database failure rolls back records and removes any newly written encrypted files", async () => {
  const app = await service();
  await app.saveNote({
    title: "Existing",
    notes: "Keep this existing capture",
  });
  const image = makeItem(
    {
      kind: "image",
      title: "New image",
      asset: assetMetadata("new.png", "image/png", sourceBytes),
      segments: [{ text: "New receipt" }],
    },
    { id: "backup-image", now: 0 },
  );
  const note = makeItem(
    { kind: "note", title: "New note", notes: "A new note in backup" },
    { id: "backup-note", now: 0 },
  );
  const archive: Archive = {
    version: 1,
    items: [
      { item: image, assetBase64: base64.encode(sourceBytes) },
      { item: note, assetBase64: null },
    ],
  };
  selectedBackup(
    JSON.stringify(await encryptBackup(archive, password, random)),
  );
  mock.failInsertId = note.id;
  await assert.rejects(
    () => app.importBackup(password),
    /Injected database insert failure/,
  );
  assert.equal((await app.listItems()).length, 1);
  assert.equal(filesAt("file:///docs/inbox-v1/").length, 0);
});
test("exported portable backup contains original bytes and removes its shared temporary file", async () => {
  const app = await service();
  mock.put(sourceUri, sourceBytes);
  const saved = await app.captureFile({
    uri: sourceUri,
    name: "receipt.png",
    mimeType: "image/png",
  });
  await app.exportBackup(password);
  assert.equal(mock.shares.length, 1);
  assert.ok(!mock.files.has(mock.shares[0].uri));
  const restored = await decryptBackup(mock.shares[0].text, password);
  assert.equal(restored.items[0]!.item.id, saved.item.id);
  assert.deepEqual(base64.decode(restored.items[0]!.assetBase64!), sourceBytes);
});
