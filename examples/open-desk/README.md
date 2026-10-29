# Open Desk

An original, MIT-licensed, offline workspace by Nymrel: a bookmark library, task board, and focus timer. Version 0.1.0 is a source release inside the Warm Paper examples. No account or subscription is required.

## Run

Requires Node.js 22.12 or newer. No install step and no runtime dependencies:

```sh
git clone https://github.com/nymrel/a2ui-warm-paper.git
cd a2ui-warm-paper/examples/open-desk
npm start
```

Open `http://127.0.0.1:4178`. Run `npm test` in this directory for the independent domain tests. The server binds to your computer's loopback interface. To use the app on another device, serve this directory with your existing HTTPS static host. No backend or environment secrets are needed. Keep a stable URL: browser storage belongs to its exact origin.

## Three tools

| Tool | Included behavior | Intentional improvements in this implementation |
| --- | --- | --- |
| Library | Save links, titles, notes, tags; search all fields | Remove common tracking parameters while preserving obvious signed URLs, reject duplicate normalized links, never fetch remote thumbnails or page metadata |
| Tasks | To do / In progress / Done, priorities, due dates, search | Move tasks with accessible status menus; no dragging required; undo the latest removal |
| Focus | Select a task, choose 15/25/45/60 minutes, pause/resume, recent history | Persist a deadline rather than count interval callbacks; recover elapsed time on return/reload; record completion once |

Shared improvements: on-device storage, zero runtime dependencies, responsive layouts, no external fonts/assets/analytics, validated JSON backup export and non-destructive merge, explicit storage-error recovery, and protection against silently overwriting another tab's changes. These are implementation properties, not measured superiority over another product.

## Public behavior study and original implementation

This app studies three familiar workflows from public product descriptions:

- Raindrop.io: [bookmarks, tags, collections and search](https://raindrop.io/) and [bookmark documentation](https://help.raindrop.io/bookmarks/).
- Todoist: [task board layout](https://www.todoist.com/help/todoist/features/use-the-board-layout-in-todoist-AiAVsyEI).
- Pomofocus: [browser focus-timer workflow](https://pomofocus.io/).

The scope is an independently implemented subset, not feature parity. No vendor source, logos, screenshots, extracted assets, private APIs, credentials, or binary disassembly were used. Product names identify the public references only; this project is unaffiliated. The visual design uses Nymrel's existing Warm Paper palette. The standalone browser example does not require the React component package.

## Offline and data recovery

After the first successful visit over HTTPS or localhost, a service worker caches the app shell. Reopen the same URL to use links, tasks, search, and focus without a network connection. Visiting saved external links still requires their websites. Installation support varies by browser; this is a web app, not an App Store or Google Play release.

All workspace data is stored as JSON under `nymrel.open-desk.v1` in this browser's local storage. There is no cloud sync, user account, data collection, encryption, remote metadata lookup, or notification permission. Anyone with access to your browser profile can read its data. Clearing site data or losing the device can remove it. Use **Export backup** regularly and transfer the JSON yourself when changing devices.

**Import backup** validates the entire file before making any change. It merges new records, preserves existing IDs and the current timer, and skips duplicate normalized links. It does not restore an incoming active timer. Backups have a 2 MB UTF-8 / 5,000-total-record limit. Unsafe fields, unknown schema versions, malformed records and non-HTTP(S) links are rejected. Backups contain your notes and should be kept privately.

If storage is unavailable, a banner explains that work lives only in the current tab. Failed saves preserve the form input. Corrupt saved JSON is protected from overwriting, with a recovery download and an explicit fresh-start action after you save that recovery copy. If another tab changes the saved workspace, saving pauses until you load its latest version; export the current tab first if needed. Simultaneous writes at precisely the same time are not transactionally locked; use one editing tab.

The timer calculates remaining time from the device clock; clock changes can affect it. A completed session is recorded when the app next runs, with its deadline as completion time. It does not wake a suspended app, play an alarm, or run a background native service. Reset discards the unfinished session. The last seven days count completed sessions only.

Press `/` outside a text field to focus the current Library or Tasks search. All actions also work by touch or keyboard.

## License and release boundary

MIT, copyright 2026 Nymrel / JalenBuilds LLC. See [LICENSE](LICENSE). Source publication is separate from npm, hosted deployment, or either mobile store. No new hosted infrastructure or paid build was created for this release.
