import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { base64 } from "@scure/base";
import { makeItem, assetMetadata } from "./core.ts";
import type { Archive } from "./core.ts";
import {
  sealBytes,
  openBytes,
  encryptBackup,
  decryptBackup,
} from "./crypto.ts";

const random = (length: number) => new Uint8Array(randomBytes(length));
const key = random(32);
const passphrase = "correct horse battery staple";
function fixture(): Archive {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  return {
    version: 1,
    items: [
      {
        item: makeItem(
          {
            kind: "image",
            title: "Warranty",
            asset: assetMetadata("receipt.png", "image/png", bytes),
            segments: [
              { text: "The original receipt says two year warranty." },
            ],
          },
          { id: "image-1", now: 0 },
        ),
        assetBase64: base64.encode(bytes),
      },
    ],
  };
}
test("attachment encryption authenticates bytes and uses a fresh nonce", () => {
  const data = new Uint8Array([0, 1, 2, 255]);
  const first = sealBytes(data, key, random),
    second = sealBytes(data, key, random);
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.deepEqual(openBytes(first, key), data);
  const altered = base64.decode(first.ciphertext);
  altered[0] ^= 1;
  assert.throws(
    () => openBytes({ ...first, ciphertext: base64.encode(altered) }, key),
    /decrypt/,
  );
  assert.throws(() => openBytes(first, random(32)), /decrypt/);
});
test("attachment encryption rejects bad key/provider/schema before any persistence", () => {
  assert.throws(
    () => sealBytes(new Uint8Array([1]), new Uint8Array(16), random),
    /32-byte/,
  );
  assert.throws(
    () => sealBytes(new Uint8Array([1]), key, () => new Uint8Array(1)),
    /random/,
  );
  const envelope = sealBytes(new Uint8Array([1]), key, random);
  for (const value of [
    { ...envelope, version: 2 },
    { ...envelope, algorithm: "none" },
    { ...envelope, nonce: "AA==" },
    { ...envelope, ciphertext: "??" },
    { ...envelope, unexpected: true },
  ])
    assert.throws(() => openBytes(value, key));
});
test("password-protected backup roundtrip includes original file bytes", async () => {
  const archive = fixture();
  const encrypted = await encryptBackup(archive, passphrase, random);
  assert.equal(encrypted.iterations, 600000);
  assert.equal(encrypted.kdf, "PBKDF2-SHA256");
  assert.equal(encrypted.cipher.algorithm, "AES-256-GCM");
  assert.ok(!JSON.stringify(encrypted).includes("Warranty"));
  assert.deepEqual(
    await decryptBackup(JSON.stringify(encrypted), passphrase),
    archive,
  );
  await assert.rejects(
    () => decryptBackup(encrypted, "the wrong password"),
    /decrypt/,
  );
  const bytes = base64.decode(encrypted.cipher.ciphertext);
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(
    () =>
      decryptBackup(
        {
          ...encrypted,
          cipher: { ...encrypted.cipher, ciphertext: base64.encode(bytes) },
        },
        passphrase,
      ),
    /decrypt/,
  );
});
test("backups validate algorithms, KDF cost and passphrase before deriving keys", async () => {
  await assert.rejects(
    () => encryptBackup(fixture(), "short", random),
    /passphrase/,
  );
  const encrypted = await encryptBackup(
    { version: 1, items: [] },
    passphrase,
    random,
  );
  for (const value of [
    "{",
    { ...encrypted, version: 2 },
    { ...encrypted, kdf: "scrypt" },
    { ...encrypted, iterations: 1 },
    { ...encrypted, iterations: 1000000000 },
    { ...encrypted, salt: "AAAA" },
    { ...encrypted, cipher: { ...encrypted.cipher, extra: 1 } },
    { ...encrypted, extra: "x" },
  ])
    await assert.rejects(() => decryptBackup(value, passphrase));
});
test("local data and backup cryptographic contexts are distinct", async () => {
  const local = sealBytes(
    new TextEncoder().encode('{"version":1,"items":[]}'),
    key,
    random,
  );
  // A local envelope cannot be presented as a valid portable backup without its password-bound key and context.
  await assert.rejects(
    () =>
      decryptBackup(
        {
          version: 1,
          kdf: "PBKDF2-SHA256",
          iterations: 600000,
          salt: base64.encode(random(16)),
          cipher: local,
        },
        passphrase,
      ),
    /decrypt/,
  );
});
