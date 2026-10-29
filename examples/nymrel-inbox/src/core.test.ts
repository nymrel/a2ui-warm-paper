import test from "node:test";
import assert from "node:assert/strict";
import { base64 } from "@scure/base";
import {
  assetMetadata,
  makeItem,
  normalizeUrl,
  validateItem,
  validateArchive,
  contentFingerprint,
  searchItems,
  suggestTags,
  relatedItems,
  MAX_FILE_BYTES,
  MAX_ITEMS,
} from "./core.ts";
import type { Item, Archive } from "./core.ts";

const now = Date.parse("2026-10-28T12:00:00.000Z");
const note = (id = "note-1", value = "An original design idea"): Item =>
  makeItem({ kind: "note", title: "Design notes", notes: value }, { id, now });
function image(id = "image-1"): { item: Item; bytes: Uint8Array } {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  return {
    item: makeItem(
      {
        kind: "image",
        title: "Headphones warranty",
        asset: assetMetadata("warranty.png", "image/png", bytes),
        segments: [
          {
            text: "Receipt: studio headphones. Warranty guarantee expires in 2028.",
            page: 1,
          },
        ],
      },
      { id, now },
    ),
    bytes,
  };
}
test("captures keep a strict portable schema without paths or functions", () => {
  const item = note();
  assert.equal(validateItem(item), item);
  assert.equal(item.asset, null);
  assert.throws(
    () => validateItem({ ...item, uri: "file:///private/note.txt" }),
    /unsupported/,
  );
  assert.throws(
    () => validateItem(Object.assign(Object.create({ bad: true }), item)),
    /ordinary/,
  );
  assert.throws(() => validateItem({ ...item, id: "../file" }), /ID/);
  assert.throws(
    () => validateItem({ ...item, createdAt: "yesterday" }),
    /date/,
  );
  assert.throws(() => validateItem({ ...item, kind: "unknown" }), /kind/);
  assert.throws(
    () => makeItem({ kind: "note", title: "Empty" }, { id: "empty", now }),
    /some text/,
  );
});
test("normalization keeps signed links and untouched functional query bytes", () => {
  assert.equal(
    normalizeUrl(
      "https://EXAMPLE.com/doc?token=a%20b&x=~&x=2&utm_source=ad#top",
    ),
    "https://example.com/doc?token=a%20b&x=~&x=2#top",
  );
  assert.equal(
    normalizeUrl("https://example.com/?utm_source=x&%73ig=a%2Bb"),
    "https://example.com/?utm_source=x&%73ig=a%2Bb",
  );
  assert.equal(
    normalizeUrl("https://example.com/?%ZZ=2&%75tm_source=ad"),
    "https://example.com/?%ZZ=2",
  );
  for (const url of [
    "javascript:alert(1)",
    "https://username:secret@example.com",
    "file:///etc/passwd",
    "/relative",
  ])
    assert.throws(() => normalizeUrl(url));
});
test("makeItem clones source segments and normalizes suggested input", () => {
  const segments = [{ text: "Receipt body" }];
  const item = makeItem(
    {
      kind: "note",
      title: " My receipt ",
      tags: ["Finance", " finance ", ""],
      segments,
    },
    { id: "n", now },
  );
  assert.deepEqual(item.tags, ["finance"]);
  assert.equal(item.title, "My receipt");
  segments[0]!.text = "Changed";
  assert.equal(item.segments[0]!.text, "Receipt body");
});
test("file metadata binds bytes to their MIME, path-free name, size and checksum", () => {
  const { item } = image();
  assert.ok(item.asset);
  assert.equal(item.asset.sha256.length, 64);
  for (const asset of [
    { ...item.asset, name: "../../private.pdf" },
    { ...item.asset, name: "a\\b" },
    { ...item.asset, name: "a\u0000b" },
    { ...item.asset, size: MAX_FILE_BYTES + 1 },
    { ...item.asset, sha256: "0" },
    { ...item.asset, mimeType: "text/plain" },
  ])
    assert.throws(() => validateItem({ ...item, asset }));
  assert.throws(() => validateItem({ ...item, asset: null }), /incompatible/);
  assert.throws(
    () => validateItem({ ...note(), asset: item.asset }),
    /incompatible/,
  );
});
test("citation coordinates and text bounds are validated", () => {
  const { item } = image();
  for (const segment of [
    { text: "x", page: 0 },
    { text: "x", startMs: 100, endMs: 99 },
    { text: "x", endMs: 100 },
    { text: "x", startMs: -1 },
    { text: "x", url: "https://x.test" },
  ])
    assert.throws(() => validateItem({ ...item, segments: [segment] }));
  assert.throws(() =>
    validateItem({
      ...item,
      segments: Array.from({ length: 1001 }, () => ({ text: "x" })),
    }),
  );
  assert.throws(
    () => validateItem({ ...item, tags: ["finance", "FINANCE"] }),
    /unique/,
  );
});
test("archive roundtrip includes every original file and verifies exact checksums", () => {
  const { item, bytes } = image();
  const archive: Archive = {
    version: 1,
    items: [
      { item, assetBase64: base64.encode(bytes) },
      { item: note(), assetBase64: null },
    ],
  };
  assert.deepEqual(validateArchive(JSON.stringify(archive)), archive);
  const before = JSON.stringify(archive);
  assert.throws(
    () =>
      validateArchive({
        ...archive,
        items: [
          { item, assetBase64: base64.encode(new Uint8Array([1, 2, 3, 4, 6])) },
        ],
      }),
    /checksum/,
  );
  assert.throws(
    () => validateArchive({ ...archive, items: [{ item, assetBase64: null }] }),
    /missing/,
  );
  assert.throws(
    () =>
      validateArchive({
        ...archive,
        items: [{ item: note(), assetBase64: "AAAA" }],
      }),
    /fileless/,
  );
  assert.equal(JSON.stringify(archive), before);
});
test("archive rejects unsupported versions, unsafe keys, malformed data and duplicate IDs", () => {
  const entry = { item: note(), assetBase64: null };
  for (const archive of [
    "{",
    "null",
    '{"version":1,"items":[],"__proto__":{}}',
    { version: 2, items: [] },
    { version: 1, items: [entry, entry] },
    { version: 1, items: [{ ...entry, path: "file:///private" }] },
    { version: 1, items: Array(MAX_ITEMS + 1).fill(entry) },
  ])
    assert.throws(() => validateArchive(archive));
  const withUnsafe = JSON.parse(JSON.stringify({ version: 1, items: [entry] }));
  withUnsafe.items[0].item.segments = [
    JSON.parse('{"text":"secret","constructor":{}}'),
  ];
  assert.throws(() => validateArchive(withUnsafe), /unsupported/);
});
test("fingerprints identify repeated originals, tracking-only URLs and exact note text", () => {
  const a = image("a"),
    b = image("b");
  assert.equal(contentFingerprint(a.item), contentFingerprint(b.item));
  const link = (id: string, url: string) =>
    makeItem({ kind: "link", title: "An idea", url }, { id, now });
  assert.equal(
    contentFingerprint(link("a", "https://example.com/?utm_source=x")),
    contentFingerprint(link("b", "https://example.com/")),
  );
  assert.equal(
    contentFingerprint(note("a", "  My   Note ")),
    contentFingerprint(note("b", "my note")),
  );
  assert.notEqual(
    contentFingerprint(note("a", "One note")),
    contentFingerprint(note("b", "Another note")),
  );
});
test("search ranks coverage and returns verbatim source passages with citations", () => {
  const { item } = image();
  const partial = note("other", "A warranty for something else");
  const found = searchItems([partial, item], "find my headphones receipt");
  assert.equal(found[0]!.item.id, item.id);
  assert.equal(found[0]!.matches.find((m) => m.field === "segment")!.page, 1);
  assert.equal(
    found[0]!.matches.find((m) => m.field === "segment")!.segmentIndex,
    0,
  );
  assert.equal(
    found[0]!.matches.find((m) => m.field === "segment")!.text,
    item.segments[0]!.text,
  );
  assert.equal(searchItems([item], "invoice")[0]!.item.id, item.id);
  assert.deepEqual(searchItems([item], "unrelatedvalue"), []);
});
test("audio search keeps original time references and metadata matches identify their field", () => {
  const bytes = new Uint8Array([0, 1]);
  const item = makeItem(
    {
      kind: "audio",
      title: "Meeting recording",
      asset: assetMetadata("meeting.wav", "audio/wav", bytes),
      segments: [
        { text: "Discuss the project budget.", startMs: 1000, endMs: 2400 },
      ],
    },
    { id: "audio", now },
  );
  const result = searchItems([item], "budget")[0]!;
  assert.equal(result.matches[0]!.startMs, 1000);
  assert.equal(result.matches[0]!.endMs, 2400);
  assert.equal(searchItems([item], "meeting")[0]!.matches[0]!.field, "title");
});
test("tag suggestions and related records are deterministic and leave source untouched", () => {
  const item = image().item;
  const other = note("other", "Keep the headphones warranty receipt");
  const before = JSON.stringify(item);
  assert.ok(suggestTags(item).includes("finance"));
  assert.ok(suggestTags(item).includes("home"));
  assert.equal(relatedItems(item, [item, other])[0]!.item.id, "other");
  assert.equal(JSON.stringify(item), before);
  assert.deepEqual(relatedItems(item, [item]), []);
});
