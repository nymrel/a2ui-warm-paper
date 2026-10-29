import {
  createEmptyState,
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
  finishTimer,
  resetTimer,
  remainingSeconds,
} from "./core.mjs";

const $ = (id) => document.getElementById(id);
const KEY = "nymrel.open-desk.v1";
let state = createEmptyState(),
  savedRaw = null,
  storageMode = "persistent",
  activeView = "bookmarks",
  undoState = null,
  failedCompletion = null;
const node = (tag, text = "", className = "") => {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
};
function announce(message, error = false, canUndo = false) {
  const el = $("message");
  el.classList.toggle("error", error);
  el.replaceChildren(node("span", message));
  if (canUndo) {
    const b = node("button", "Undo", "undo");
    b.type = "button";
    b.onclick = () => {
      if (undoState) commit(undoState, "Restored.");
    };
    el.append(b);
  }
}
function warning(message, { reload = false, recovery = false } = {}) {
  $("storage-warning").hidden = false;
  $("storage-message").textContent = message;
  $("reload").hidden = !reload;
  $("recovery").hidden = !recovery;
}
function load() {
  try {
    savedRaw = localStorage.getItem(KEY);
    if (savedRaw) state = importBackup(savedRaw);
  } catch (e) {
    if (savedRaw !== null) {
      storageMode = "blocked";
      warning(
        "The saved workspace could not be read. Download its recovery data before changing it.",
        { recovery: true },
      );
    } else {
      storageMode = "memory";
      warning(
        "Browser storage is unavailable. This tab still works, but export a backup before closing it.",
      );
    }
  }
  render();
}
function commit(next, message, { undo = false } = {}) {
  try {
    next = importBackup(JSON.stringify(next));
    if (storageMode === "blocked")
      throw new Error(
        "The saved data is protected. Download recovery data first; your input has been kept.",
      );
    if (storageMode === "conflict")
      throw new Error(
        "Another tab changed this workspace. Load the latest saved version before saving.",
      );
    if (storageMode === "persistent") {
      let current;
      try {
        current = localStorage.getItem(KEY);
      } catch {
        storageMode = "memory";
        warning(
          "Storage access was lost. Export a backup before closing this tab.",
        );
      }
      if (storageMode === "persistent") {
        if (current !== savedRaw) {
          storageMode = "conflict";
          warning(
            "Another tab changed this workspace. Export this tab if needed, then load the latest saved version.",
            { reload: true },
          );
          throw new Error("Save paused to protect changes from another tab.");
        }
        const raw = JSON.stringify(next);
        try {
          localStorage.setItem(KEY, raw);
          savedRaw = raw;
        } catch {
          throw new Error(
            "Could not save: device storage may be full. Export a backup and free some space. Your input has been kept.",
          );
        }
      }
    }
    undoState = undo ? state : null;
    state = next;
    render();
    if (message) announce(message, false, undo);
    return true;
  } catch (e) {
    announce(e.message, true);
    return false;
  }
}
function act(fn, message, options) {
  try {
    return commit(fn(state), message, options);
  } catch (e) {
    announce(e.message, true);
    return false;
  }
}
function switchView(view) {
  activeView = view;
  for (const v of ["bookmarks", "tasks", "focus"]) {
    $(v + "-view").hidden = v !== view;
    document
      .querySelector(`[data-view="${v}"]`)
      .setAttribute("aria-pressed", String(v === view));
  }
  tick();
}
document
  .querySelectorAll("[data-view]")
  .forEach((b) => (b.onclick = () => switchView(b.dataset.view)));
function empty(title, detail) {
  const el = node("div", "", "empty");
  el.append(node("strong", title), node("p", detail));
  return el;
}
function renderBookmarks() {
  const list = $("bookmark-list");
  list.replaceChildren();
  const results = searchBookmarks(state, $("bookmark-search").value);
  $("library-total").textContent = String(state.bookmarks.length);
  for (const b of results) {
    const card = node("article", "", "bookmark-card");
    const domain = node("div", "", "domain");
    domain.append(
      node("span", new URL(b.url).hostname[0].toUpperCase(), "domain-mark"),
      node("span", new URL(b.url).hostname),
    );
    const title = node("h3");
    const a = node("a", b.title);
    a.href = b.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    title.append(a);
    card.append(domain, title);
    if (b.notes) card.append(node("p", b.notes));
    const tags = node("div", "", "tags");
    b.tags.forEach((t) => tags.append(node("span", t, "tag")));
    card.append(tags);
    const bottom = node("div", "", "card-bottom");
    bottom.append(
      node(
        "span",
        new Date(b.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      ),
    );
    const remove = node("button", "Remove");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove " + b.title);
    remove.onclick = () =>
      act((s) => removeBookmark(s, b.id), "Link removed.", { undo: true });
    bottom.append(remove);
    card.append(bottom);
    list.append(card);
  }
  if (!results.length)
    list.append(
      empty(
        state.bookmarks.length
          ? "No matches."
          : "A home for your next good idea.",
        state.bookmarks.length
          ? "Try a different title, tag, or note."
          : "Save a link above to start your library.",
      ),
    );
}
function renderTasks() {
  const board = $("task-board");
  board.replaceChildren();
  const q = $("task-search").value.trim().toLowerCase();
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  for (const [status, label] of [
    ["todo", "To do"],
    ["doing", "In progress"],
    ["done", "Done"],
  ]) {
    const column = node("section", "", "column");
    column.setAttribute("aria-label", label);
    const tasks = state.tasks.filter(
      (t) =>
        t.status === status &&
        `${t.title} ${t.notes}`.toLowerCase().includes(q),
    );
    const h = node("h3", label);
    h.append(node("span", String(tasks.length)));
    column.append(h);
    for (const t of tasks) {
      const card = node("article", "", "task-card");
      card.append(node("h4", t.title));
      const meta = node("div", "", "meta");
      meta.append(node("span", t.priority, "tag priority-" + t.priority));
      if (t.dueDate)
        meta.append(
          node(
            "span",
            t.dueDate,
            "tag" +
              (t.dueDate < localDate && status !== "done" ? " overdue" : ""),
          ),
        );
      card.append(meta);
      if (t.notes) card.append(node("p", t.notes));
      const controls = node("div", "", "task-controls");
      const lab = node("label", "Status");
      const sel = node("select");
      sel.setAttribute("aria-label", "Status for " + t.title);
      sel.dataset.taskId = t.id;
      for (const [value, name] of [
        ["todo", "To do"],
        ["doing", "In progress"],
        ["done", "Done"],
      ]) {
        const opt = node("option", name);
        opt.value = value;
        opt.selected = value === status;
        sel.append(opt);
      }
      sel.onchange = () => {
        if (
          act((s) => updateTask(s, t.id, { status: sel.value }), "Task moved.")
        ) {
          document.querySelector(`select[data-task-id="${t.id}"]`)?.focus();
        }
      };
      lab.append(sel);
      const remove = node("button", "Remove");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove " + t.title);
      remove.onclick = () =>
        act((s) => removeTask(s, t.id), "Task removed.", { undo: true });
      controls.append(lab, remove);
      card.append(controls);
      column.append(card);
    }
    if (!tasks.length)
      column.append(
        node(
          "p",
          q ? "No matching tasks." : "Room for what comes next.",
          "column-empty",
        ),
      );
    board.append(column);
  }
}
function renderFocus() {
  const taskSelect = $("focus-task");
  const selected =
    state.timer.status === "idle" ? taskSelect.value : state.timer.taskId;
  taskSelect.replaceChildren();
  const open = node("option", "An open session");
  open.value = "";
  taskSelect.append(open);
  const available = state.tasks.filter(
    (t) => t.status !== "done" || t.id === state.timer.taskId,
  );
  for (const task of available) {
    const opt = node("option", task.title);
    opt.value = task.id;
    taskSelect.append(opt);
  }
  taskSelect.value = available.some((t) => t.id === selected) ? selected : "";
  taskSelect.disabled = state.timer.status !== "idle";
  const durationSelect = $("focus-duration");
  durationSelect.disabled = state.timer.status !== "idle";
  if (state.timer.status !== "idle") {
    const value = String(state.timer.durationSeconds / 60);
    if (![...durationSelect.options].some((option) => option.value === value)) {
      const option = node("option", `${value} minutes (saved session)`);
      option.value = value;
      durationSelect.append(option);
    }
    durationSelect.value = value;
  }
  const isRunning = state.timer.status === "running";
  $("timer-toggle").textContent = isRunning
    ? "Pause"
    : state.timer.status === "paused"
      ? "Resume"
      : "Start focusing";
  $("timer-label").textContent = isRunning
    ? "IN YOUR OWN RHYTHM"
    : state.timer.status === "paused"
      ? "TAKE A BREATH"
      : "A FRESH START";
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  $("focus-minutes").textContent = String(
    Math.floor(
      state.sessions
        .filter((s) => new Date(s.completedAt).getTime() >= cutoff)
        .reduce((n, s) => n + s.seconds, 0) / 60,
    ),
  );
  const list = $("session-list");
  list.replaceChildren();
  for (const session of state.sessions.slice(0, 8)) {
    const el = node("div", "", "session");
    const title =
      state.tasks.find((t) => t.id === session.taskId)?.title || "Open session";
    el.append(
      node("span", title),
      node(
        "small",
        `${Math.round(session.seconds / 60)} min · ${new Date(session.completedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
      ),
    );
    list.append(el);
  }
  if (!state.sessions.length)
    list.append(
      node("p", "Your completed sessions will appear here.", "column-empty"),
    );
  updateClock();
}
function updateClock() {
  const seconds =
    state.timer.status === "idle"
      ? Number($("focus-duration").value) * 60
      : remainingSeconds(state, Date.now());
  $("timer-display").textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function tick() {
  if (
    state.timer.status === "running" &&
    remainingSeconds(state, Date.now()) === 0 &&
    storageMode !== "conflict" &&
    storageMode !== "blocked" &&
    failedCompletion !== state
  ) {
    if (
      !act(
        (s) => finishTimer(s, Date.now()),
        "Session complete. A little progress, well earned.",
      )
    )
      failedCompletion = state;
  }
  updateClock();
}
function render() {
  $("bookmark-count").textContent = String(state.bookmarks.length);
  $("task-count").textContent = String(
    state.tasks.filter((t) => t.status !== "done").length,
  );
  $("save-status").textContent =
    storageMode === "persistent"
      ? "Saved on this device"
      : storageMode === "memory"
        ? "Only in this tab · export to keep"
        : "Saving paused";
  renderBookmarks();
  renderTasks();
  renderFocus();
}
$("bookmark-form").onsubmit = (e) => {
  e.preventDefault();
  if (
    act(
      (s) =>
        addBookmark(s, {
          url: $("bookmark-url").value,
          title: $("bookmark-title").value,
          tags: $("bookmark-tags")
            .value.split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          notes: $("bookmark-notes").value,
        }),
      "Link saved.",
    )
  ) {
    e.target.reset();
    $("bookmark-url").focus();
  }
};
$("task-form").onsubmit = (e) => {
  e.preventDefault();
  if (
    act(
      (s) =>
        addTask(s, {
          title: $("task-title").value,
          dueDate: $("task-due").value,
          priority: $("task-priority").value,
        }),
      "Task added.",
    )
  ) {
    e.target.reset();
    $("task-title").focus();
  }
};
$("bookmark-search").oninput = renderBookmarks;
$("task-search").oninput = renderTasks;
$("focus-duration").onchange = updateClock;
$("timer-toggle").onclick = () => {
  const status = state.timer.status;
  if (status === "running" && remainingSeconds(state, Date.now()) === 0) {
    tick();
    return;
  }
  act(
    (s) =>
      status === "running"
        ? pauseTimer(s)
        : status === "paused"
          ? resumeTimer(s)
          : startTimer(
              s,
              Number($("focus-duration").value),
              $("focus-task").value,
            ),
    status === "running"
      ? "Timer paused."
      : status === "paused"
        ? "Timer resumed."
        : "Your focus session has started.",
  );
};
$("timer-reset").onclick = () =>
  act(resetTimer, "Timer reset. No unfinished session was recorded.");
function download(text, name, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = node("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export").onclick = () => {
  download(
    JSON.stringify(state),
    `open-desk-${new Date().toISOString().slice(0, 10)}.json`,
  );
  announce(
    "Backup exported. Keep it somewhere you trust; it contains your links, notes, and tasks.",
  );
};
$("import-trigger").onclick = () => $("import").click();
$("import").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024)
      throw new Error("Choose a JSON backup smaller than 2 MB.");
    const incoming = importBackup(await file.text());
    const next = mergeBackup(state, incoming);
    commit(
      next,
      "Backup merged. Existing items were kept; duplicate links were skipped.",
    );
  } catch (error) {
    announce(error.message, true);
  } finally {
    e.target.value = "";
  }
};
$("recovery").onclick = () => {
  download(savedRaw || "", "open-desk-recovery.txt", "text/plain");
  $("fresh-start").hidden = false;
  $("storage-message").textContent =
    "Save the recovery download first. Starting a new workspace replaces the unreadable saved data. You can then import a valid backup.";
};
$("fresh-start").onclick = () => {
  if (
    !confirm(
      "Have you saved the recovery download? Replace the unreadable saved data with an empty workspace?",
    )
  )
    return;
  try {
    if (localStorage.getItem(KEY) !== savedRaw)
      throw new Error(
        "Saved data changed in another tab. Reload before resetting.",
      );
    const raw = JSON.stringify(createEmptyState());
    localStorage.setItem(KEY, raw);
    location.reload();
  } catch (error) {
    announce(error.message, true);
  }
};
$("reload").onclick = () => location.reload();
window.addEventListener("storage", (e) => {
  if (e.key === KEY || e.key === null) {
    storageMode = "conflict";
    warning(
      "Another tab changed the saved workspace. Export this tab if needed, then load the latest version.",
      { reload: true },
    );
    $("save-status").textContent = "Saving paused";
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tick();
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    const search =
      activeView === "tasks"
        ? $("task-search")
        : activeView === "bookmarks"
          ? $("bookmark-search")
          : null;
    if (search) {
      e.preventDefault();
      search.focus();
    }
  }
});
load();
tick();
setInterval(tick, 1000);
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    /* The workspace remains usable without offline caching. */
  });
}
