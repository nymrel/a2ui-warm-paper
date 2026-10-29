/** Open Desk's browser-independent domain model. MIT, Nymrel / JalenBuilds LLC. */
export const BACKUP_LIMIT = 2 * 1024 * 1024;
export const RECORD_LIMIT = 5000;
const statuses = new Set(["todo", "doing", "done"]);
const priorities = new Set(["low", "normal", "high"]);
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);

function fail(message) {
  throw new Error(message);
}
function object(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object.`);
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    fail(`${label} has an invalid prototype.`);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    fail(`${label} contains an unsupported field.`);
  if (keys.some((key) => !Object.hasOwn(value, key)))
    fail(`${label} is missing a required field.`);
}
function text(value, max, label, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail(`${label} is invalid.`);
  return value;
}
function identifier(value, optional = false) {
  if (optional && value === "") return value;
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    fail("Record ID is invalid.");
  return value;
}
function number(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(`${label} is invalid.`);
  return value;
}
function instant(value) {
  text(value, 30, "Timestamp", true);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value)
    fail("Timestamp is invalid.");
  return value;
}
function epoch(value) {
  return number(value, 0, 8640000000000000, "Clock time");
}
function date(value) {
  if (value === "") return value;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail("Due date must be YYYY-MM-DD.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    fail("Due date is invalid.");
  return value;
}
function id() {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto?.getRandomValues !== "function")
    fail(
      "This browser cannot generate record IDs. Try a current browser or serve Open Desk over HTTPS.",
    );
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function iso(now) {
  return new Date(epoch(now)).toISOString();
}
function cleanText(value, max, label, required = false) {
  return text(value, max, label, required).trim();
}
function cleanTags(tags = []) {
  if (!Array.isArray(tags) || tags.length > 30) fail("Use at most 30 tags.");
  const unique = new Map();
  for (const tag of tags) {
    const cleaned = cleanText(tag, 40, "Tag", true);
    unique.set(cleaned.toLocaleLowerCase(), cleaned);
  }
  return [...unique.values()];
}
function capacity(state) {
  if (
    state.bookmarks.length + state.tasks.length + state.sessions.length >
    RECORD_LIMIT
  )
    fail(`Backups support at most ${RECORD_LIMIT} records.`);
  if (new TextEncoder().encode(JSON.stringify(state)).length > BACKUP_LIMIT)
    fail(
      "This workspace has reached its 2 MB backup limit. Export a backup and remove old records before adding more.",
    );
  return state;
}

export function createEmptyState() {
  return {
    version: 1,
    bookmarks: [],
    tasks: [],
    sessions: [],
    timer: {
      status: "idle",
      durationSeconds: 1500,
      remainingSeconds: 1500,
      deadline: null,
      taskId: "",
    },
  };
}

/** Preserve functional query bytes/order; leave obviously signed queries intact. */
export function normalizeUrl(input) {
  text(input, 4096, "URL", true);
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    fail("Enter a complete http:// or https:// URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  )
    fail(
      "Only HTTP or HTTPS links without embedded credentials are supported.",
    );
  const pairs = url.search.slice(1).split("&");
  const decodedKey = (pair) => {
    try {
      return decodeURIComponent(pair.split("=", 1)[0].replace(/\+/g, " "));
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

function validateBookmark(bookmark) {
  object(
    bookmark,
    ["id", "url", "title", "tags", "notes", "createdAt"],
    "Bookmark",
  );
  identifier(bookmark.id);
  normalizeUrl(bookmark.url);
  text(bookmark.title, 240, "Title", true);
  cleanTags(bookmark.tags);
  text(bookmark.notes, 10000, "Notes");
  instant(bookmark.createdAt);
}
function validateTask(task) {
  object(
    task,
    ["id", "title", "notes", "status", "priority", "dueDate", "createdAt"],
    "Task",
  );
  identifier(task.id);
  text(task.title, 240, "Title", true);
  text(task.notes, 10000, "Notes");
  if (!statuses.has(task.status) || !priorities.has(task.priority))
    fail("Task status or priority is invalid.");
  date(task.dueDate);
  instant(task.createdAt);
}
function validateSession(session) {
  object(session, ["id", "taskId", "seconds", "completedAt"], "Focus session");
  identifier(session.id);
  identifier(session.taskId, true);
  number(session.seconds, 60, 14400, "Session length");
  instant(session.completedAt);
}
function validateState(state) {
  object(
    state,
    ["version", "bookmarks", "tasks", "sessions", "timer"],
    "Backup",
  );
  if (state.version !== 1) fail("Unsupported backup version.");
  for (const [key, validate] of [
    ["bookmarks", validateBookmark],
    ["tasks", validateTask],
    ["sessions", validateSession],
  ]) {
    if (!Array.isArray(state[key]) || state[key].length > RECORD_LIMIT)
      fail(`${key} must contain at most ${RECORD_LIMIT} records.`);
    const ids = new Set();
    for (const record of state[key]) {
      validate(record);
      if (ids.has(record.id)) fail(`Duplicate ${key} ID.`);
      ids.add(record.id);
    }
  }
  capacity(state);
  const urls = new Set();
  for (const bookmark of state.bookmarks) {
    const url = normalizeUrl(bookmark.url);
    if (urls.has(url)) fail("Backup contains duplicate bookmark URLs.");
    urls.add(url);
  }
  const timer = state.timer;
  object(
    timer,
    ["status", "durationSeconds", "remainingSeconds", "deadline", "taskId"],
    "Timer",
  );
  if (!["idle", "running", "paused"].includes(timer.status))
    fail("Timer status is invalid.");
  number(timer.durationSeconds, 60, 14400, "Timer duration");
  number(timer.remainingSeconds, 0, timer.durationSeconds, "Remaining time");
  identifier(timer.taskId, true);
  if (timer.status === "running") epoch(timer.deadline);
  else if (timer.deadline !== null)
    fail("A stopped timer cannot have a deadline.");
  if (
    timer.status === "idle" &&
    timer.remainingSeconds !== timer.durationSeconds
  )
    fail("Idle timer is invalid.");
  if (timer.status === "paused" && timer.remainingSeconds === 0)
    fail("Paused timer must have time remaining.");
  return state;
}

/** Validate the entire file before a caller replaces any saved state. */
export function importBackup(json) {
  if (
    typeof json !== "string" ||
    new TextEncoder().encode(json).length > BACKUP_LIMIT
  )
    fail("Backup must be a JSON file no larger than 2 MB.");
  let state;
  try {
    state = JSON.parse(json, (key, value) => {
      if (forbiddenKeys.has(key)) fail("Backup contains an unsafe field.");
      return value;
    });
  } catch (error) {
    fail(
      error.message === "Backup contains an unsafe field."
        ? error.message
        : "Backup is not valid JSON.",
    );
  }
  return validateState(state);
}

export function addBookmark(state, input, now = Date.now()) {
  const url = normalizeUrl(input.url);
  if (state.bookmarks.some((item) => normalizeUrl(item.url) === url))
    fail("That link is already saved.");
  const bookmark = {
    id: id(),
    url,
    title: cleanText(input.title || new URL(url).hostname, 240, "Title", true),
    tags: cleanTags(input.tags),
    notes: cleanText(input.notes || "", 10000, "Notes"),
    createdAt: iso(now),
  };
  return capacity({ ...state, bookmarks: [bookmark, ...state.bookmarks] });
}
export function removeBookmark(state, recordId) {
  return {
    ...state,
    bookmarks: state.bookmarks.filter((item) => item.id !== recordId),
  };
}
export function searchBookmarks(state, query = "") {
  const terms = String(query)
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return state.bookmarks.filter((item) => {
    const haystack = [item.title, item.url, item.notes, ...item.tags]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
export function addTask(state, input, now = Date.now()) {
  const task = {
    id: id(),
    title: cleanText(input.title, 240, "Title", true),
    notes: cleanText(input.notes || "", 10000, "Notes"),
    status: input.status || "todo",
    priority: input.priority || "normal",
    dueDate: input.dueDate || "",
    createdAt: iso(now),
  };
  validateTask(task);
  return capacity({ ...state, tasks: [task, ...state.tasks] });
}
export function updateTask(state, recordId, patch) {
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    Object.keys(patch).some(
      (key) =>
        !["title", "notes", "status", "priority", "dueDate"].includes(key),
    )
  )
    fail("Task update contains an unsupported field.");
  if (!state.tasks.some((task) => task.id === recordId))
    fail("Task no longer exists.");
  return capacity({
    ...state,
    tasks: state.tasks.map((task) => {
      if (task.id !== recordId) return task;
      const updated = { ...task, ...patch };
      if (Object.hasOwn(patch, "title"))
        updated.title = cleanText(patch.title, 240, "Title", true);
      if (Object.hasOwn(patch, "notes"))
        updated.notes = cleanText(patch.notes, 10000, "Notes");
      validateTask(updated);
      return updated;
    }),
  });
}
export function removeTask(state, recordId) {
  return {
    ...state,
    tasks: state.tasks.filter((task) => task.id !== recordId),
  };
}

/** Existing records and the active timer win; backups cannot overwrite them. */
export function mergeBackup(state, incoming) {
  validateState(state);
  validateState(incoming);
  const merge = (key) => {
    const ids = new Set(state[key].map((record) => record.id));
    const urls = new Set(
      key === "bookmarks"
        ? state[key].map((record) => normalizeUrl(record.url))
        : [],
    );
    return [
      ...state[key],
      ...incoming[key]
        .filter((record) => {
          const url = key === "bookmarks" ? normalizeUrl(record.url) : null;
          if (ids.has(record.id) || (url && urls.has(url))) return false;
          ids.add(record.id);
          if (url) urls.add(url);
          return true;
        })
        .map((record) => structuredClone(record)),
    ];
  };
  return capacity({
    ...state,
    bookmarks: merge("bookmarks"),
    tasks: merge("tasks"),
    sessions: merge("sessions"),
  });
}

export function remainingSeconds(state, now = Date.now()) {
  if (state.timer.status !== "running") return state.timer.remainingSeconds;
  return Math.max(
    0,
    Math.min(
      state.timer.durationSeconds,
      Math.ceil((state.timer.deadline - epoch(now)) / 1000),
    ),
  );
}
export function startTimer(state, minutes = 25, taskId = "", now = Date.now()) {
  number(minutes, 1, 240, "Focus minutes");
  epoch(now);
  identifier(taskId, true);
  if (taskId && !state.tasks.some((task) => task.id === taskId))
    fail("Select an existing task.");
  if (state.timer.status !== "idle")
    fail("Reset the current session before starting another.");
  const seconds = minutes * 60;
  return {
    ...state,
    timer: {
      status: "running",
      durationSeconds: seconds,
      remainingSeconds: seconds,
      deadline: now + seconds * 1000,
      taskId,
    },
  };
}
export function pauseTimer(state, now = Date.now()) {
  if (state.timer.status !== "running") return state;
  const remaining = remainingSeconds(state, now);
  if (!remaining) return finishTimer(state, now);
  return {
    ...state,
    timer: {
      ...state.timer,
      status: "paused",
      remainingSeconds: remaining,
      deadline: null,
    },
  };
}
export function resumeTimer(state, now = Date.now()) {
  if (state.timer.status !== "paused") return state;
  return {
    ...state,
    timer: {
      ...state.timer,
      status: "running",
      deadline: epoch(now) + state.timer.remainingSeconds * 1000,
    },
  };
}
export function resetTimer(state) {
  return {
    ...state,
    timer: {
      ...state.timer,
      status: "idle",
      remainingSeconds: state.timer.durationSeconds,
      deadline: null,
      taskId: "",
    },
  };
}
export function finishTimer(state, now = Date.now()) {
  if (state.timer.status !== "running" || remainingSeconds(state, now) > 0)
    return state;
  const session = {
    id: id(),
    taskId: state.timer.taskId,
    seconds: state.timer.durationSeconds,
    completedAt: iso(state.timer.deadline),
  };
  return capacity({
    ...resetTimer(state),
    sessions: [session, ...state.sessions],
  });
}
