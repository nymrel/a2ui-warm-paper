/** Nymrel Inbox domain model. MIT, Nymrel / JalenBuilds LLC. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { base64 } from "@scure/base";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ARCHIVE_ASSET_BYTES = 100 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024;
export const MAX_ITEMS = 1000;
export const MAX_ITEM_TEXT_BYTES = 1024 * 1024;
export type Kind = "note" | "link" | "image" | "pdf" | "audio";
export type Segment = {
  text: string;
  page?: number;
  startMs?: number;
  endMs?: number;
};
export type AssetMeta = {
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
};
export type Item = {
  id: string;
  kind: Kind;
  title: string;
  url: string;
  notes: string;
  tags: string[];
  createdAt: string;
  segments: Segment[];
  asset: AssetMeta | null;
};
export type ArchiveEntry = { item: Item; assetBase64: string | null };
export type Archive = { version: 1; items: ArchiveEntry[] };
export type SearchMatch = {
  text: string;
  segmentIndex: number;
  field: "title" | "notes" | "tags" | "url" | "segment";
  page?: number;
  startMs?: number;
  endMs?: number;
};
export type SearchResult = {
  item: Item;
  score: number;
  matches: SearchMatch[];
};
/** Optional adapter contract only. Core never creates a client or transmits data. */
export interface ModelAdapter {
  id: string;
  suggestTags(item: Readonly<Item>): Promise<string[]>;
  embed?(texts: readonly string[]): Promise<number[][]>;
}

const encoder = new TextEncoder();
const kinds = new Set<Kind>(["note", "link", "image", "pdf", "audio"]);
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
function fail(message: string): never {
  throw new Error(message);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}
function record(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be an ordinary object.`);
  if (
    Object.keys(value).some(
      (key) =>
        forbiddenKeys.has(key) ||
        (!required.includes(key) && !optional.includes(key)),
    )
  )
    fail(`${label} contains an unsupported field.`);
  if (required.some((key) => !Object.hasOwn(value, key)))
    fail(`${label} is missing a required field.`);
}
function text(
  value: unknown,
  max: number,
  label: string,
  required = false,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail(`${label} is invalid.`);
}
function integer(
  value: unknown,
  min: number,
  max: number,
  label: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail(`${label} is invalid.`);
}
function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    fail("Item ID is invalid.");
}
function timestamp(value: unknown): asserts value is string {
  text(value, 30, "Capture date", true);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value)
    fail("Capture date is invalid.");
}

/** Derived from Open Desk: retain functional query bytes/order and obvious signatures. */
export function normalizeUrl(input: string): string {
  text(input, 4096, "URL", true);
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return fail("Enter a complete HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  )
    fail("Only HTTP or HTTPS URLs without embedded credentials are supported.");
  const pairs = url.search.slice(1).split("&");
  const decodedKey = (pair: string) => {
    try {
      return decodeURIComponent(pair.split("=", 1)[0]!.replace(/\+/g, " "));
    } catch {
      return null;
    }
  };
  const signed = pairs.some((pair) =>
    /^(sig|signature|x-amz-signature|x-goog-signature)$/i.test(
      decodedKey(pair) || "",
    ),
  );
  if (!signed && url.search) {
    const kept = pairs.filter((pair) => {
      const key = decodedKey(pair);
      return (
        key === null || (!/^utm_/i.test(key) && !/^(fbclid|gclid)$/i.test(key))
      );
    });
    url.search = kept.length ? `?${kept.join("&")}` : "";
  }
  return url.href;
}

export function validateItem(value: unknown): Item {
  record(
    value,
    [
      "id",
      "kind",
      "title",
      "url",
      "notes",
      "tags",
      "createdAt",
      "segments",
      "asset",
    ],
    [],
    "Item",
  );
  identifier(value.id);
  if (!kinds.has(value.kind as Kind)) fail("Capture kind is invalid.");
  text(value.title, 300, "Title", true);
  text(value.url, 4096, "URL");
  text(value.notes, 10000, "Notes");
  timestamp(value.createdAt);
  if (value.kind === "link") normalizeUrl(value.url);
  else if (value.url !== "")
    fail("Only link captures can contain a source URL.");
  if (!Array.isArray(value.tags) || value.tags.length > 30)
    fail("Use at most 30 tags.");
  const tags = new Set<string>();
  for (const tag of value.tags) {
    text(tag, 40, "Tag", true);
    const key = tag.trim().toLowerCase();
    if (tags.has(key)) fail("Tags must be unique.");
    tags.add(key);
  }
  if (!Array.isArray(value.segments) || value.segments.length > 1000)
    fail("Capture text must have at most 1,000 segments.");
  let bytes = encoder.encode(
    value.title + value.url + value.notes + value.tags.join(" "),
  ).length;
  for (const segment of value.segments) {
    record(segment, ["text"], ["page", "startMs", "endMs"], "Source segment");
    text(segment.text, 200000, "Source text");
    bytes += encoder.encode(segment.text).length;
    if (Object.hasOwn(segment, "page"))
      integer(segment.page, 1, 1000000, "Page number");
    if (Object.hasOwn(segment, "startMs"))
      integer(segment.startMs, 0, 86400000, "Start time");
    if (Object.hasOwn(segment, "endMs")) {
      integer(segment.endMs, 0, 86400000, "End time");
      if (
        typeof segment.startMs !== "number" ||
        segment.endMs < segment.startMs
      )
        fail("Source time range is invalid.");
    }
  }
  if (bytes > MAX_ITEM_TEXT_BYTES)
    fail("This capture exceeds its 1 MB searchable-text limit.");
  const binary = ["image", "pdf", "audio"].includes(value.kind as string);
  if (value.asset !== null) {
    record(
      value.asset,
      ["name", "mimeType", "size", "sha256"],
      [],
      "Original file",
    );
    text(value.asset.name, 240, "File name", true);
    text(value.asset.mimeType, 120, "File type", true);
    if (
      /[\/\\\u0000-\u001f]/.test(value.asset.name) ||
      value.asset.name === "." ||
      value.asset.name === ".."
    )
      fail("Original file name must not contain a path.");
    if (
      !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(
        value.asset.mimeType,
      )
    )
      fail("Original file MIME type is invalid.");
    integer(value.asset.size, 1, MAX_FILE_BYTES, "File size");
    if (
      typeof value.asset.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.asset.sha256)
    )
      fail("Original file checksum is invalid.");
    if (
      (value.kind === "image" && !value.asset.mimeType.startsWith("image/")) ||
      (value.kind === "pdf" && value.asset.mimeType !== "application/pdf") ||
      (value.kind === "audio" && !value.asset.mimeType.startsWith("audio/"))
    )
      fail("Original file type does not match this capture.");
  }
  if ((binary && value.asset === null) || (!binary && value.asset !== null))
    fail("This capture has an incompatible original file.");
  if (
    value.kind === "note" &&
    !value.notes.trim() &&
    !value.segments.some((s) => String(s.text).trim())
  )
    fail("A note must contain some text.");
  return value as Item;
}

export function makeItem(
  input: {
    kind: Kind;
    title: string;
    url?: string;
    notes?: string;
    tags?: string[];
    segments?: Segment[];
    asset?: AssetMeta | null;
  },
  options: { id: string; now?: number },
): Item {
  const tags = [
    ...new Map(
      (input.tags || []).map((tag) => [tag.trim().toLowerCase(), tag.trim()]),
    ).values(),
  ].filter(Boolean);
  const item: Item = {
    id: options.id,
    kind: input.kind,
    title: input.title.trim(),
    url: input.kind === "link" ? normalizeUrl(input.url || "") : "",
    notes: (input.notes || "").trim(),
    tags,
    createdAt: new Date(options.now ?? Date.now()).toISOString(),
    segments: (input.segments || []).map((segment) => ({ ...segment })),
    asset: input.asset ? { ...input.asset } : null,
  };
  return validateItem(item);
}

export function assetMetadata(
  name: string,
  mimeType: string,
  bytes: Uint8Array,
): AssetMeta {
  return {
    name,
    mimeType,
    size: bytes.length,
    sha256: bytesToHex(sha256(bytes)),
  };
}

export function validateArchive(input: unknown): Archive {
  let value = input;
  if (typeof value === "string") {
    if (
      value.length > MAX_ARCHIVE_BYTES ||
      encoder.encode(value).length > MAX_ARCHIVE_BYTES
    )
      fail("Backup exceeds the 150 MB encoded-size limit.");
    try {
      value = JSON.parse(value);
    } catch {
      fail("Backup is not valid JSON.");
    }
  }
  record(value, ["version", "items"], [], "Archive");
  if (value.version !== 1) fail("Unsupported archive version.");
  if (!Array.isArray(value.items) || value.items.length > MAX_ITEMS)
    fail("Archive supports at most 1,000 captures.");
  const ids = new Set<string>();
  let total = 0,
    textBytes = 0;
  for (const entry of value.items) {
    record(entry, ["item", "assetBase64"], [], "Archive entry");
    const item = validateItem(entry.item);
    if (ids.has(item.id)) fail("Archive contains duplicate item IDs.");
    ids.add(item.id);
    textBytes += encoder.encode(JSON.stringify(item)).length;
    if (textBytes > 10 * 1024 * 1024)
      fail("Archive searchable text exceeds 10 MB.");
    if (item.asset === null) {
      if (entry.assetBase64 !== null)
        fail("A fileless capture cannot include an original file.");
      continue;
    }
    if (
      typeof entry.assetBase64 !== "string" ||
      entry.assetBase64.length !== 4 * Math.ceil(item.asset.size / 3)
    )
      fail("Original file data is missing or has the wrong size.");
    let bytes: Uint8Array;
    try {
      bytes = base64.decode(entry.assetBase64);
    } catch {
      return fail("Original file data is not valid Base64.");
    }
    if (
      bytes.length !== item.asset.size ||
      base64.encode(bytes) !== entry.assetBase64 ||
      bytesToHex(sha256(bytes)) !== item.asset.sha256
    )
      fail("Original file checksum does not match.");
    total += bytes.length;
    if (total > MAX_ARCHIVE_ASSET_BYTES)
      fail("Archive originals exceed the 100 MB limit.");
  }
  return value as Archive;
}

function normalizedNote(item: Item): string {
  return [item.notes, ...item.segments.map((s) => s.text)]
    .join("\n")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
export function contentFingerprint(item: Item): string {
  validateItem(item);
  if (item.asset) return `sha256:${item.asset.sha256}`;
  if (item.kind === "link") return `url:${normalizeUrl(item.url)}`;
  return `note:${bytesToHex(sha256(encoder.encode(normalizedNote(item))))}`;
}

const stopWords = new Set(
  "a an the and or of to in for from with on at by my me i it is was that this those these saved save find show about".split(
    " ",
  ),
);
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss"))
    return word.slice(0, -1);
  return word;
}
function tokens(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !stopWords.has(w))
    .map(stem);
}
const synonymGroups = [
  ["receipt", "invoice"],
  ["warranty", "guarantee"],
  ["car", "auto", "automobile"],
  ["photo", "image", "screenshot"],
  ["idea", "concept"],
  ["job", "employment"],
  ["apartment", "housing", "residence"],
];
function expansions(term: string): string[] {
  return synonymGroups.find((group) => group.includes(term)) || [term];
}
function fields(item: Item): SearchMatch[] {
  return [
    { text: item.title, segmentIndex: -1, field: "title" },
    { text: item.notes, segmentIndex: -1, field: "notes" },
    { text: item.tags.join(" "), segmentIndex: -1, field: "tags" },
    { text: item.url, segmentIndex: -1, field: "url" },
    ...item.segments.map(
      (segment, segmentIndex): SearchMatch => ({
        ...segment,
        segmentIndex,
        field: "segment",
      }),
    ),
  ];
}
function excerpt(text: string, terms: string[]): string {
  if (text.length <= 360) return text;
  const lower = text.toLowerCase();
  const positions = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0);
  const at = positions.length ? Math.max(0, Math.min(...positions) - 100) : 0;
  return `${at ? "…" : ""}${text.slice(at, at + 360)}${at + 360 < text.length ? "…" : ""}`;
}

/** Local lexical ranking with a small, explicit English synonym table; no model call. */
export function searchItems(
  items: readonly Item[],
  query: string,
  limit = 100,
): SearchResult[] {
  text(query, 500, "Search query");
  integer(limit, 1, MAX_ITEMS, "Result limit");
  const terms = [...new Set(tokens(query))].slice(0, 24);
  if (!terms.length)
    return [...items]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((item) => ({ item, score: 0, matches: [] }));
  const results: SearchResult[] = [];
  for (const item of items) {
    const matchedTerms = new Set<string>();
    const matches: SearchMatch[] = [];
    let score = 0;
    for (const field of fields(item)) {
      const set = new Set(tokens(field.text));
      const hit = terms.filter((term) =>
        expansions(term).some((candidate) => set.has(candidate)),
      );
      if (!hit.length) continue;
      hit.forEach((term) => matchedTerms.add(term));
      score +=
        hit.length *
        (field.field === "title"
          ? 6
          : field.field === "tags"
            ? 5
            : field.field === "segment"
              ? 3
              : 2);
      matches.push({
        ...field,
        text: excerpt(field.text, hit.flatMap(expansions)),
      });
    }
    if (matchedTerms.size)
      results.push({
        item,
        score: score + Math.round((1000 * matchedTerms.size) / terms.length),
        matches: matches.slice(0, 8),
      });
  }
  return results
    .sort(
      (a, b) =>
        b.score - a.score || b.item.createdAt.localeCompare(a.item.createdAt),
    )
    .slice(0, limit);
}

const tagRules: [string, string[]][] = [
  ["finance", ["receipt", "invoice", "payment", "tax", "budget"]],
  ["work", ["job", "employment", "project", "meeting"]],
  ["health", ["health", "doctor", "medical", "exercise", "fitness"]],
  ["home", ["housing", "apartment", "residence", "rent", "warranty"]],
  ["ideas", ["idea", "concept", "design", "inspiration"]],
  ["travel", ["flight", "travel", "hotel", "reservation"]],
];
/** Suggestions are returned, never silently attached to a capture. */
export function suggestTags(item: Item): string[] {
  const set = new Set(
    tokens(
      fields(item)
        .map((f) => f.text)
        .join(" "),
    ),
  );
  return tagRules
    .filter(([, terms]) => terms.some((term) => set.has(stem(term))))
    .map(([tag]) => tag)
    .filter(
      (tag) => !item.tags.some((existing) => existing.toLowerCase() === tag),
    );
}
export function relatedItems(
  item: Item,
  items: readonly Item[],
  limit = 5,
): { item: Item; score: number }[] {
  integer(limit, 1, 20, "Related result limit");
  const left = new Set(
    tokens(
      fields(item)
        .map((f) => f.text)
        .join(" "),
    ),
  );
  return items
    .filter((other) => other.id !== item.id)
    .map((other) => {
      const right = new Set(
        tokens(
          fields(other)
            .map((f) => f.text)
            .join(" "),
        ),
      );
      const overlap = [...left].filter((term) => right.has(term)).length;
      return {
        item: other,
        score: overlap / Math.max(1, left.size + right.size - overlap),
      };
    })
    .filter((result) => result.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.item.createdAt.localeCompare(a.item.createdAt),
    )
    .slice(0, limit);
}
