import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const code = await readFile(new URL("./sw.js", import.meta.url), "utf8");
function harness() {
  const handlers = {};
  const added = [],
    deleted = [];
  let claimed = false;
  const fixture = new Response("offline shell");
  const context = {
    URL,
    Response,
    self: {
      location: {
        origin: "https://example.com",
        href: "https://example.com/desk/sw.js",
      },
      clients: {
        claim: async () => {
          claimed = true;
        },
      },
      addEventListener: (name, handler) => {
        handlers[name] = handler;
      },
    },
    caches: {
      open: async () => ({ addAll: async (assets) => added.push(...assets) }),
      keys: async () => [
        "unrelated-cache",
        "nymrel-open-desk-0.0.1",
        "nymrel-open-desk-0.1.0",
      ],
      delete: async (key) => deleted.push(key),
      match: async () => fixture,
    },
    fetch: async () => {
      throw new Error("offline");
    },
  };
  vm.runInNewContext(code, context);
  return {
    handlers,
    added,
    deleted,
    get claimed() {
      return claimed;
    },
    fixture,
  };
}
test("offline install precaches the complete local app shell", async () => {
  const h = harness();
  let work;
  h.handlers.install({
    waitUntil: (p) => {
      work = p;
    },
  });
  await work;
  for (const asset of [
    "./",
    "./index.html",
    "./app.mjs",
    "./core.mjs",
    "./styles.css",
    "./icon.svg",
    "./manifest.webmanifest",
  ])
    assert.ok(h.added.includes(asset), asset);
});
test("activation removes previous Open Desk caches and retains unrelated caches", async () => {
  const h = harness();
  let work;
  h.handlers.activate({
    waitUntil: (p) => {
      work = p;
    },
  });
  await work;
  assert.deepEqual(h.deleted, ["nymrel-open-desk-0.0.1"]);
  assert.equal(h.claimed, true);
});
test("offline requests use cached assets only within the app scope", async () => {
  const h = harness();
  let work;
  h.handlers.fetch({
    request: { method: "GET", url: "https://example.com/desk/index.html" },
    respondWith: (p) => {
      work = p;
    },
  });
  assert.equal(await work, h.fixture);
  for (const request of [
    { method: "GET", url: "https://other.com/desk/index.html" },
    { method: "POST", url: "https://example.com/desk/index.html" },
    { method: "GET", url: "https://example.com/elsewhere/index.html" },
  ]) {
    let intercepted = false;
    h.handlers.fetch({
      request,
      respondWith: () => {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false);
  }
});
