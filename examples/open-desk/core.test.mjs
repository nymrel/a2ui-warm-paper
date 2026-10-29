import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyState,
  normalizeUrl,
  addBookmark,
  removeBookmark,
  searchBookmarks,
  addTask,
  updateTask,
  removeTask,
  importBackup,
  mergeBackup,
  startTimer,
  pauseTimer,
  resumeTimer,
  resetTimer,
  finishTimer,
  remainingSeconds,
  BACKUP_LIMIT,
  RECORD_LIMIT,
} from "./core.mjs";

const now = Date.parse("2026-10-28T12:00:00.000Z");
const roundtrip = (state) => importBackup(JSON.stringify(state));
test("empty backup round-trips with an independent timer", () => {
  const a = createEmptyState(),
    b = createEmptyState();
  assert.deepEqual(roundtrip(a), a);
  assert.notEqual(a.timer, b.timer);
});
test("link normalization removes trackers but preserves functional query and fragments", () => {
  assert.equal(
    normalizeUrl("https://EXAMPLE.com:443/doc?b=2&utm_Source=x&a=1&fbclid=y#g"),
    "https://example.com/doc?b=2&a=1#g",
  );
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hey",
    "file:///tmp/a",
    "/relative",
    "https://u:p@example.com",
  ])
    assert.throws(() => normalizeUrl(url));
});
test("tracking cleanup preserves exact functional query bytes and duplicate-key order", () => {
  assert.equal(
    normalizeUrl(
      "https://example.com/doc?token=a%20b&style=x~&item=second&item=first&utm_source=feed&item=third",
    ),
    "https://example.com/doc?token=a%20b&style=x~&item=second&item=first&item=third",
  );
  assert.equal(
    normalizeUrl(
      "https://example.com/?%75tm_source=encoded&keep=a%2Bb&%66bclid=click&%broken=value",
    ),
    "https://example.com/?keep=a%2Bb&%broken=value",
  );
  assert.equal(
    normalizeUrl("https://example.com/?gclid=x&utm_medium=email"),
    "https://example.com/",
  );
});
test("obvious signing parameters preserve the complete original query including trackers", () => {
  for (const signature of [
    "sig",
    "SIGNATURE",
    "X-Amz-Signature",
    "x-goog-signature",
    "%73ig",
  ]) {
    const url = `https://example.com/doc?token=a%20b&utm_source=required&${signature}=x~&item=second&item=first`;
    assert.equal(normalizeUrl(url), url);
  }
});
test("adding bookmarks is immutable, deduplicates normalized links and searches all fields", () => {
  const a = createEmptyState();
  const b = addBookmark(
    a,
    {
      title: "Research",
      url: "https://example.com/?utm_source=x",
      tags: ["NFL", "nfl"],
      notes: "Quarterback models",
    },
    now,
  );
  assert.equal(a.bookmarks.length, 0);
  assert.equal(b.bookmarks.length, 1);
  assert.equal(b.bookmarks[0].tags.length, 1);
  assert.throws(() => addBookmark(b, { url: "https://example.com/" }));
  assert.equal(searchBookmarks(b, "NFL quarterback").length, 1);
  assert.equal(searchBookmarks(b, "missing").length, 0);
  assert.equal(removeBookmark(b, b.bookmarks[0].id).bookmarks.length, 0);
  assert.deepEqual(roundtrip(b), b);
});
test("tasks validate calendar dates, enum fields and immutable edits", () => {
  const a = addTask(
    createEmptyState(),
    { title: "Ship", dueDate: "2028-02-29", priority: "high" },
    now,
  );
  const recordId = a.tasks[0].id;
  const b = updateTask(a, recordId, {
    status: "doing",
    notes: "First useful release",
  });
  assert.equal(a.tasks[0].status, "todo");
  assert.equal(b.tasks[0].status, "doing");
  for (const patch of [
    { dueDate: "2026-02-29" },
    { dueDate: "2026-13-01" },
    { status: "unknown" },
    { priority: "critical" },
    { title: " " },
    { id: "overwrite" },
  ])
    assert.throws(() => updateTask(a, recordId, patch));
  assert.throws(() => updateTask(a, "missing", { status: "done" }));
  assert.equal(removeTask(b, recordId).tasks.length, 0);
  assert.deepEqual(roundtrip(b), b);
});
test("import rejects malformed, incompatible, missing and unsafe fields atomically", () => {
  const original = addTask(createEmptyState(), { title: "Keep me" }, now);
  const before = JSON.stringify(original);
  for (const raw of [
    "{",
    "null",
    "[]",
    '{"version":2}',
    '{"__proto__":{}}',
    '{"constructor":{}}',
    JSON.stringify({ ...original, timer: { ...original.timer, deadline: 10 } }),
    JSON.stringify({ ...original, surprising: true }),
    JSON.stringify({
      ...original,
      tasks: [{ ...original.tasks[0], notes: 1 }],
    }),
  ])
    assert.throws(() => importBackup(raw));
  assert.equal(JSON.stringify(original), before);
  assert.throws(() => importBackup(" ".repeat(BACKUP_LIMIT + 1)));
  assert.throws(() => importBackup('"' + "😀".repeat(BACKUP_LIMIT / 4) + '"'));
});
test("import rejects duplicate IDs, duplicate normalized URLs and record-count overflow", () => {
  const a = addBookmark(
    createEmptyState(),
    { url: "https://example.com" },
    now,
  );
  assert.throws(() =>
    roundtrip({
      ...a,
      bookmarks: [...a.bookmarks, { ...a.bookmarks[0], id: "second" }],
    }),
  );
  const b = addTask(createEmptyState(), { title: "task" }, now);
  assert.throws(() =>
    roundtrip({ ...b, tasks: [...b.tasks, { ...b.tasks[0] }] }),
  );
  const many = Array.from({ length: RECORD_LIMIT + 1 }, (_, i) => ({
    ...b.tasks[0],
    id: `id-${i}`,
  }));
  assert.throws(() => roundtrip({ ...b, tasks: many }));
});
test("merge retains current records and timer while adding distinct records once", () => {
  const a = addTask(
    addBookmark(
      createEmptyState(),
      { url: "https://example.com", title: "Original" },
      now,
    ),
    { title: "Original task" },
    now,
  );
  const b = addTask(
    addBookmark(
      createEmptyState(),
      { url: "https://example.com/?utm_source=again", title: "Changed" },
      now,
    ),
    { title: "Another task" },
    now,
  );
  b.tasks.push({ ...a.tasks[0], title: "Do not overwrite" });
  const result = mergeBackup(a, b);
  assert.equal(result.bookmarks.length, 1);
  assert.equal(result.bookmarks[0].title, "Original");
  assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0].title, "Original task");
  assert.equal(result.timer, a.timer);
  assert.deepEqual(mergeBackup(result, b), result);
  assert.equal(a.tasks.length, 1);
  result.tasks[1].title = "Mutated";
  assert.equal(b.tasks[0].title, "Another task");
});
test("running timer uses a deadline across a long background interval and completes once", () => {
  const empty = createEmptyState();
  const running = startTimer(empty, 25, "", now);
  assert.equal(remainingSeconds(running, now + 61000), 1439);
  assert.equal(remainingSeconds(running, now + 3600000), 0);
  const complete = finishTimer(roundtrip(running), now + 3600000);
  assert.equal(complete.timer.status, "idle");
  assert.equal(complete.sessions.length, 1);
  assert.equal(complete.sessions[0].seconds, 1500);
  assert.equal(complete.sessions[0].completedAt, "2026-10-28T12:25:00.000Z");
  assert.equal(finishTimer(complete, now + 3600001), complete);
  assert.equal(empty.timer.status, "idle");
});
test("pause persists remaining time; resume excludes paused time; expired pause completes", () => {
  let state = startTimer(createEmptyState(), 1, "", now);
  state = pauseTimer(state, now + 10000);
  assert.equal(state.timer.status, "paused");
  assert.equal(remainingSeconds(state, now + 500000), 50);
  state = resumeTimer(roundtrip(state), now + 500000);
  assert.equal(remainingSeconds(state, now + 510000), 40);
  assert.equal(finishTimer(state, now + 510000), state);
  state = pauseTimer(state, now + 550000);
  assert.equal(state.sessions.length, 1);
  assert.equal(state.timer.status, "idle");
});
test("focus validation, task binding, cancellation and malformed timer imports", () => {
  const state = addTask(createEmptyState(), { title: "Focus task" }, now);
  for (const minutes of [0, 241, 1.5, NaN, "25"])
    assert.throws(() => startTimer(state, minutes, "", now));
  assert.throws(() => startTimer(state, 25, "missing", now));
  const active = startTimer(state, 1, state.tasks[0].id, now);
  assert.throws(() => startTimer(active, 1, "", now));
  const reset = resetTimer(active);
  assert.equal(reset.sessions.length, 0);
  assert.equal(reset.timer.taskId, "");
  assert.throws(() =>
    roundtrip({ ...active, timer: { ...active.timer, deadline: -1 } }),
  );
  assert.throws(() =>
    roundtrip({
      ...active,
      timer: {
        ...active.timer,
        status: "paused",
        deadline: null,
        remainingSeconds: 0,
      },
    }),
  );
  assert.equal(remainingSeconds(active, now - 1000), 60);
});
test("record mutations remain small enough for their own backup importer", () => {
  const base = addTask(
    createEmptyState(),
    { title: "First", notes: "a".repeat(10000) },
    now,
  );
  const large = {
    ...base,
    tasks: Array.from({ length: 206 }, (_, i) => ({
      ...base.tasks[0],
      id: `task-${i}`,
    })),
  };
  roundtrip(large);
  assert.throws(() =>
    addTask(large, { title: "Overflow", notes: "😀".repeat(2500) }, now),
  );
  const withShort = {
    ...large,
    tasks: [...large.tasks, { ...base.tasks[0], id: "short", notes: "" }],
  };
  roundtrip(withShort);
  assert.throws(() =>
    updateTask(withShort, "short", { notes: "😀".repeat(2500) }),
  );
});
test("record IDs fall back to getRandomValues when randomUUID is unavailable", () => {
  const crypto = globalThis.crypto;
  const original = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  try {
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
    const a = addTask(
      createEmptyState(),
      { title: "HTTP browser fallback" },
      now,
    );
    const b = addTask(a, { title: "Another record" }, now);
    assert.match(
      a.tasks[0].id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.notEqual(a.tasks[0].id, b.tasks[0].id);
    assert.deepEqual(roundtrip(b), b);
  } finally {
    if (original) Object.defineProperty(crypto, "randomUUID", original);
    else delete crypto.randomUUID;
  }
});
test("browsers without a crypto provider receive a useful record-ID error", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
    assert.throws(
      () => addTask(createEmptyState(), { title: "Unsupported" }, now),
      /cannot generate record IDs/,
    );
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else delete globalThis.crypto;
  }
});
