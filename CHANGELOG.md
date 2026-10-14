# Changelog

Every notable change to Uber Notebook is listed here, newest first. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version
numbers follow [Semantic Versioning](https://semver.org/).

## [1.1.3] - 2026-10-14

Release notes in the app, a shorter README, and fixes from the first issue and pull requests.

### Added

- Settings → What's new: every release's notes, newest first, the latest open. It reads the notes that come with the app, so it works offline.
- After an update, the sidebar says once which version you're on, with *What's new*.

### Changed

- A shorter README. Everything in detail is in docs/guide.md, the security details in SECURITY.md, how it works in docs/how-it-works.md, and this changelog is reorganized.

### Fixed

- The window opens without `qt6-webengine` installed; only a PDF's pages don't show then ([#1](https://github.com/marcho78/ubernotebook/issues/1), reported by @UnderStackDev).
- Agents get long answers in full: `blocks` or `read` on a big page used to be cut off. A long answer now comes as a file to read.
- Changing a big open page's title, icon or cover no longer answers "omarchy-shell is not responding", and you stay where you were on the page.
- Markdown export keeps text that looks like a heading or a list item as text, a code block with a fence line inside as one block, and a heading with a line break as one heading ([#3](https://github.com/marcho78/ubernotebook/pull/3), thanks @nixfred).
- Calendar import keeps an event's notes when it has an alert, and backslashes in notes (contacts' too); a middle name goes after the given name; a 29 February with no year is the next one ([#4](https://github.com/marcho78/ubernotebook/pull/4), thanks @nixfred).
- `#constructor` and similar names can't break tags or notebook ids ([#5](https://github.com/marcho78/ubernotebook/pull/5), thanks @nixfred).
- Importing a folder that's hidden, or inside a hidden one, finds its files; a window rule Hyprland refused is tried again ([#6](https://github.com/marcho78/ubernotebook/pull/6), thanks @nixfred).
- Imports keep notes between two `---` lines at the top, link and footnote lines in code samples, an email body line that starts like a boundary, and a heading or list after an unclosed paragraph ([#7](https://github.com/marcho78/ubernotebook/pull/7), thanks @nixfred).
- The tests run on a fresh clone ([#2](https://github.com/marcho78/ubernotebook/pull/2), thanks @nixfred).

### Security

- The files helper refuses a file that says it's empty but isn't (like `/proc/self/environ`), whatever the size limit ([#2](https://github.com/marcho78/ubernotebook/pull/2), thanks @nixfred).

## [1.1.2] - 2026-10-09

The skill and reminder details are yours to turn on, and the update command restarts the shell.

### Changed

- The Uber Notebook skill is off until you turn on Settings → AI → *Enable Uber Notebook skill*; off, Uber Notebook takes its own links out. If you had it before, turn it on again.
- The agent panel, and agents started from Uber Notebook, get the skill either way.
- The first time Uber Notebook opens (and once after this update) it asks about the skill and reminder details. While one's off, a strip over Pages has *Turn on* and *Dismiss*.
- Reminder details moved to Settings → Notifications → *Show reminder details in notifications*, off by default. Setting a reminder while they're off asks whether to show them.
- The update command is now `omarchy plugin update marcho78.uber-notebook && omarchy restart shell`, so all of a new version runs. Updating from 1.1.1, run `omarchy restart shell` after it.

### Fixed

- After a plugin was installed, updated or turned on, your notes were written without the files helper, and new files weren't made yours alone.

## [1.1.1] - 2026-10-09

Reminders keep their words out of notifications unless you turn them on.

### Changed

- A reminder's or an event alert's notification says only that one is due, and where to turn its words on: Settings → Writing → *Show what reminders say*, now off to start with. A choice you made already is kept.
- The first time in a session you set a reminder while it's off, a message in the window says so.

## [1.1.0] - 2026-10-09

Help, a New page button you can find, and privacy fixes after the marketplace's review.

### Added

- Help: Ctrl+/ (or F1), or ? at the sidebar's foot. Every key, everything you can type, every block and feature, and the commands from a terminal, with a search.
- New page is a wide button at the top of the sidebar, above Search.

### Fixed

- Ctrl+Shift+X strikes the selected words through; with blocks picked it used to cut them.
- A locked page's title no longer takes pasted lines, and Alt+Shift+↑/↓ no longer moves its blocks.
- On a locked page, the window's own keys (Ctrl+N, Ctrl+P, Ctrl+J, Ctrl+\\, Ctrl+, and Help) work from its text again.
- `omarchy-shell uber-notebook set clock 24` works: a value is read as its setting takes it.

### Security

- Your words stay off command lines, where every account on the computer can read them: search terms go on `grep`'s input, notifications through the files helper, links on `curl`'s input, agents' requests on their input.
- Everything Uber Notebook writes is yours alone (files 600, folders 700), every profile's folder and the backups' folder from before included.
- On a drive that can't keep files private (an exFAT stick, some shares), your notes, backups and Markdown copy aren't kept, and you're told.
- A reminder can leave its words out of its notification (Settings → Writing → *Show what reminders say*): Omarchy's notifications keep them on a command line for a moment.
- Nothing of one profile lands in another: a recording, a picture, an import or an export finishing after a switch stays out of the next profile, and each profile keeps its own Inbox.
- Recordings, dictation and working files go in your runtime folder, never `/tmp`; an export copies only the files its pages use.

## [1.0.0] - 2026-10-08

First public release.

### Added

- Pages: a workspace of pages made of blocks, the Notion way: `/` for any block, ⋮⋮ to drag one, blocks inside blocks, pages inside pages, columns, colors of your own.
- Blocks: to-dos, toggles, callouts, code in 30 languages, tables, boards, mind maps, sketches, equations (LaTeX), diagrams (Mermaid), footnotes, pictures and galleries, files and PDFs, videos, emails, web bookmarks, buttons and synced blocks.
- Writing: Markdown as you type; `@` for dates, people and reminders; `[[` for links to pages; `#` for tags; `:` for emoji.
- Organizing: the tree of pages, favorites, projects with a status and a due date, tags, the archive, the trash, search (Ctrl+P), page history and templates of your own.
- The Library: everything on your pages in one place.
- A calendar: month, week, agenda and compact views, events typed in plain words, repeats, alerts, `.ics` in and out.
- People: your contacts, on your computer, with `.vcf` and `.csv` import and `@` mentions.
- Audio notes, dictation and meetings, written out by voxtype; a meeting's summary from your agent.
- Your agent: Ctrl+J asks Claude Code, Grok or Codex in a panel on the page (others in a terminal); each change a step to undo; each page keeps its conversation.
- Commands for agents and scripts (`omarchy-shell uber-notebook`), and a skill that teaches them.
- Notebooks: paper notebooks on a shelf, with covers, papers, seven pens, pages that turn, planners, habits and drawing; *Move to Pages…*.
- Quick notes from anywhere with Super+Alt+N.
- Import from Markdown, Notion, Obsidian, HTML, Evernote and Word; export to PDF, Word and Markdown; print; a Markdown copy of every page.
- Profiles, a demo, backups (by hand or automatic) and restore.
- Update checks, with the command to update: Uber Notebook never installs anything itself.
- Settings in sections, your Omarchy theme, light or dark, and colors of your own.

### Security

- Your notes are read and written by a small files helper: never through a link, every save whole.
- Every program runs by its full path, with only the environment it needs, a deadline and a budget; exports are made offline.
- A zip or a backup is unpacked only inside its own folder, and is counted before anything is made.
- Text from elsewhere (a synced page, a paste, an email, an agent's answer) stays text: nothing in it is fetched or run.
- The panel's agent changes your notes only through Uber Notebook's commands, and asks you before anything else.

[1.1.3]: https://github.com/marcho78/ubernotebook/releases/tag/v1.1.3
[1.1.2]: https://github.com/marcho78/ubernotebook/releases/tag/v1.1.2
[1.1.1]: https://github.com/marcho78/ubernotebook/releases/tag/v1.1.1
[1.1.0]: https://github.com/marcho78/ubernotebook/releases/tag/v1.1.0
[1.0.0]: https://github.com/marcho78/ubernotebook/releases/tag/v1.0.0
