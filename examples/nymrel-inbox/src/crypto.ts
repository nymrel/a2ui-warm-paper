/** Authenticated encryption only. Randomness is supplied by the native CSPRNG. */
import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64 } from "@scure/base";
import { MAX_ARCHIVE_BYTES, MAX_FILE_BYTES, validateArchive } from "./core.ts";
import type { Archive } from "./core.ts";

export type RandomBytes = (length: number) => Uint8Array;
export type CipherEnvelope = {
  version: 1;
  algorithm: "AES-256-GCM";
  nonce: string;
  ciphertext: string;
};
export type BackupEnvelope = {
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: 600000;
  salt: string;
  cipher: CipherEnvelope;
};
const ITERATIONS = 600000;
const utf8 = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const LOCAL_CONTEXT = utf8.encode("Nymrel Inbox encrypted data v1");
const BACKUP_CONTEXT = utf8.encode("Nymrel Inbox portable backup v1");
export const MAX_BACKUP_ENVELOPE_BYTES =
  Math.ceil((MAX_ARCHIVE_BYTES + 16) / 3) * 4 + 4096;

function fail(message: string): never {
  throw new Error(message);
}
function object(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail(`${label} must be an ordinary object.`);
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    fail(`${label} contains an unsupported or missing field.`);
}
function randomChecked(random: RandomBytes, length: number): Uint8Array {
  const bytes = random(length);
  if (!(bytes instanceof Uint8Array) || bytes.length !== length)
    fail("The random-byte provider returned invalid data.");
  return bytes;
}
function checkedKey(key: Uint8Array): void {
  if (!(key instanceof Uint8Array) || key.length !== 32)
    fail("Encryption requires a 32-byte key.");
}
function decode(value: unknown, max: number, label: string): Uint8Array {
  if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4)
    fail(`${label} is too large or invalid.`);
  let bytes: Uint8Array;
  try {
    bytes = base64.decode(value);
  } catch {
    return fail(`${label} is not valid Base64.`);
  }
  if (bytes.length > max || base64.encode(bytes) !== value)
    fail(`${label} is invalid.`);
  return bytes;
}
function validateCipher(
  value: unknown,
  max: number,
): { nonce: Uint8Array; ciphertext: Uint8Array } {
  object(
    value,
    ["version", "algorithm", "nonce", "ciphertext"],
    "Encrypted data",
  );
  if (value.version !== 1 || value.algorithm !== "AES-256-GCM")
    fail("Unsupported encrypted-data version or algorithm.");
  const nonce = decode(value.nonce, 12, "Nonce");
  const ciphertext = decode(value.ciphertext, max + 16, "Ciphertext");
  if (nonce.length !== 12 || ciphertext.length < 16)
    fail("Encrypted data is incomplete.");
  return { nonce, ciphertext };
}
function seal(
  bytes: Uint8Array,
  key: Uint8Array,
  random: RandomBytes,
  context: Uint8Array,
  max: number,
): CipherEnvelope {
  checkedKey(key);
  if (!(bytes instanceof Uint8Array) || bytes.length > max)
    fail("Data exceeds the encryption size limit.");
  const nonce = randomChecked(random, 12);
  const ciphertext = gcm(key, nonce, context).encrypt(bytes);
  return {
    version: 1,
    algorithm: "AES-256-GCM",
    nonce: base64.encode(nonce),
    ciphertext: base64.encode(ciphertext),
  };
}
function open(
  value: unknown,
  key: Uint8Array,
  context: Uint8Array,
  max: number,
): Uint8Array {
  checkedKey(key);
  const { nonce, ciphertext } = validateCipher(value, max);
  try {
    return gcm(key, nonce, context).decrypt(ciphertext);
  } catch {
    return fail(
      "Could not decrypt: the key is incorrect or the encrypted data was modified.",
    );
  }
}
export function sealBytes(
  bytes: Uint8Array,
  key: Uint8Array,
  random: RandomBytes,
): CipherEnvelope {
  return seal(bytes, key, random, LOCAL_CONTEXT, MAX_FILE_BYTES);
}
export function openBytes(value: unknown, key: Uint8Array): Uint8Array {
  return open(value, key, LOCAL_CONTEXT, MAX_FILE_BYTES);
}
function passphrase(value: string): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    value.length > 1024 ||
    !value.trim()
  )
    fail("Use a backup passphrase of 12–1,024 characters.");
  return utf8.encode(value);
}
async function derive(
  password: Uint8Array,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return pbkdf2Async(sha256, password, salt, {
    c: ITERATIONS,
    dkLen: 32,
    asyncTick: 10,
  });
}

export async function encryptBackup(
  value: Archive,
  password: string,
  random: RandomBytes,
): Promise<BackupEnvelope> {
  const archive = validateArchive(value);
  const passwordBytes = passphrase(password);
  const bytes = utf8.encode(JSON.stringify(archive));
  if (bytes.length > MAX_ARCHIVE_BYTES)
    fail("Backup exceeds the encoded-size limit.");
  const salt = randomChecked(random, 16);
  const key = await derive(passwordBytes, salt);
  try {
    return {
      version: 1,
      kdf: "PBKDF2-SHA256",
      iterations: ITERATIONS,
      salt: base64.encode(salt),
      cipher: seal(bytes, key, random, BACKUP_CONTEXT, MAX_ARCHIVE_BYTES),
    };
  } finally {
    key.fill(0);
    passwordBytes.fill(0);
    bytes.fill(0);
  }
}
export async function decryptBackup(
  input: unknown,
  password: string,
): Promise<Archive> {
  let value = input;
  if (typeof value === "string") {
    if (
      value.length > MAX_BACKUP_ENVELOPE_BYTES ||
      utf8.encode(value).length > MAX_BACKUP_ENVELOPE_BYTES
    )
      fail("Encrypted backup exceeds the size limit.");
    try {
      value = JSON.parse(value);
    } catch {
      fail("Encrypted backup is not valid JSON.");
    }
  }
  object(
    value,
    ["version", "kdf", "iterations", "salt", "cipher"],
    "Encrypted backup",
  );
  if (
    value.version !== 1 ||
    value.kdf !== "PBKDF2-SHA256" ||
    value.iterations !== ITERATIONS
  )
    fail("Unsupported backup version or key derivation.");
  const salt = decode(value.salt, 16, "Backup salt");
  if (salt.length !== 16) fail("Backup salt is invalid.");
  validateCipher(value.cipher, MAX_ARCHIVE_BYTES); // Bound all untrusted work before deriving a key.
  const passwordBytes = passphrase(password);
  const key = await derive(passwordBytes, salt);
  let bytes: Uint8Array | undefined;
  try {
    bytes = open(value.cipher, key, BACKUP_CONTEXT, MAX_ARCHIVE_BYTES);
    return validateArchive(utf8Decoder.decode(bytes));
  } catch (error) {
    if (error instanceof Error && /decrypt/.test(error.message)) throw error;
    return fail("Decrypted backup content is invalid.");
  } finally {
    key.fill(0);
    passwordBytes.fill(0);
    bytes?.fill(0);
  }
}
