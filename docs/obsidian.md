# From Obsidian (fork)

What this fork brings over from Obsidian: a note's properties when it comes
in, daily notes, tasks (as TaskNotes and Tasks had them), a search like
Omnisearch's, and a start page.

## Properties when a note comes in

Import (and every command that reads Markdown: `add`, `append`, `prepend`…)
used to keep only a front matter's `title`, `icon`, `status` and `due`. Now
the rest of it is a line at the top of the page:

```
---
tags: [Kopfsprung, IT]
TN:
  - Sam Lee
date: 2025-02-14
---
```

becomes `#Kopfsprung #IT · TN: Sam Lee · date: 2025-02-14`, with the tags as
tags and `[[links]]` as links. Things Uber Notebook keeps for itself, and
things that are only for Obsidian's looks or bookkeeping (`cssclasses`,
`aliases`, created and modified times…), are left out. This is in
`Properties.js`.

## Daily notes

**Ctrl+Shift+T** opens today's daily note. The calendar's notebook button
(next to ← →) opens the daily note for the day it shows, and each day's note
is on the calendar as 📓, one click away. From a terminal,
`omarchy-shell uber-notebook daily 2026-10-16` (or `""` for today) gives its
id.

If there's no note for that day yet, one is made:

- **Where:** inside the page called `dailyParent` at the top of Pages
  (default *Daily notes*, made if it's missing). With `dailyByYear` (on by
  default) it goes in a page for its year (*2026*). A note goes first if the
  newest come first there, otherwise last.
- **From:** the template `dailyTemplate`, or one of your templates with
  `{{date}}` and *daily*, *tages* or *journal* in its title, or a blank
  *Daily note, {{date}}*. In the title, `{{date}}` includes the year
  (*Tagesnotiz, Sun 18 Oct 2026*). Everything else is filled in for that day
  (`{{weekday}}`…).
- **Found again:** a page in there is a day's if its title has the date in
  it: `2026-10-16`, `Fri 16 Oct 2026`, `Fri 16 Oct` (the year that matches
  the weekday, nearest now) or `16.10.2026`. If there are two for one day,
  the one in its year's page wins, then the one changed last.

```
omarchy-shell uber-notebook set dailyParent "Tagesnotizen"
omarchy-shell uber-notebook set dailyTemplate "Tagesnotiz, {{date}}"
omarchy-shell uber-notebook set dailyByYear true
```

The logic is in `Daily.js`.

## Tasks

**Tasks** in the sidebar (next to Calendar) lists every open to-do on your
pages, outside the trash, the archive and the templates. They are grouped as
*Overdue*, *Today*, *Next 7 days*, *Later* and *No date* (folded to start
with). The tags they have most filter them. Ticking one there ticks it on its
page, and *Undo* in the toast takes it back. A click opens its page at that
to-do.

What a to-do line says makes it a task:

| In the line | Means |
|---|---|
| the first `@` date or `⏰` reminder | its date (`[@Fri 16 Oct](uber-notebook://date/2026-10-16)`) |
| `#prio-hoch`, `#prio-high`, `#high`, `#wichtig`, `#dringend`, `#urgent` | important (first on its day, its box red) |
| `#prio-niedrig`, `#prio-low`, `#low` | not so important |
| `#in-arbeit`, `#doing`, `#in-progress` | in progress |

Dated tasks are also on the calendar (☐), one click away from their page.
`omarchy-shell uber-notebook tasks ""` (or `tasks "#todo"`) lists them as
JSON. The start page can be *Tasks* too.

**How:** a page's index entry keeps its open to-dos as it's saved (`tasks`:
block, words, date, priority, in progress, tags; empty fields left out).
Pages saved before this came in get theirs as the pages are read after
start, once. The view reads its pages' to-dos from memory only while it's
open. Measured on the real notes (387 open tasks, 1019 kept counting the
archived Journal's copies): the view's list takes 3 ms, the sidebar's count
1.7 ms and the calendar's 1.3 ms whenever anything changes. index.json grows
by about 190 KB (16 %), written once writing pauses. This is in `Tasks.js`
and `app/TaskView.qml`.

## Search

Ctrl+P and `find` look in the pages' text that Uber Notebook keeps in memory
anyway, not with grep in their files, once every page's text has been read
(the first few seconds after start; grep is used until then):

- Accents and umlauts don't matter: *muller* and *Mueller* find *Müller*,
  *strasse* finds *Straße*, *cafe* finds *Café*.
- A word no page has is looked for a letter off (two for words of eight
  letters or more): *Protkoll* finds *Protokoll*, *Vorstnad* finds
  *Vorstand*. These results score half and come lower down.

Each page's text is folded once (lowercase, accents off) and kept until the
page changes, and its words are counted for the near matches. Once the pages
are read, that happens in about 12 ms slices in the background. Measured on
the real notes (1554 pages, 2.5 million characters): 0.34 s in all, at most
18 ms at a time; then a search takes 6–34 ms. RAM: about 10–15 MB for the
folded text and the words. This is in `Search.js`.

## Start page

Settings → General → **Pages opens on**: *Where you were* (as before),
*Today's daily note*, *Calendar*, *Tasks* or *#todo*. This applies the first time
Pages opens after the shell starts; after that it opens where you were.
From a terminal, `set startPage` also takes `tag:<name>` or a page's title
or id (one that isn't there: where you were).

## The [fork] places

| File | What |
|---|---|
| `Daily.js`, `Properties.js`, `Search.js`, `Tasks.js`, `app/TaskView.qml` | new: the logic and views above |
| `Workspace.js` | imports Tasks.js; `tasks` on an entry (`entry`, `indexJson`) |
| `Sidebar.js`, `app/DocSidebar.qml` | the Tasks tile (its tip: `taskCount`) |
| `Workspace.qml` | imports Search.js and Tasks.js; `search()` in memory once every text is read; the warm-up after `scanTexts`; a page's tasks in `savePage` and in `scanTexts` |
| `Import.js` | imports Properties.js; the front matter's line in `fromMarkdown` |
| `Defaults.js` | `dailyParent`, `dailyTemplate`, `dailyByYear`, `startPage` |
| `app/SettingsPanel.qml` | General → Pages opens on |
| `app/DocView.qml` | imports Daily.js; `openDaily()`; Ctrl+Shift+T in `handleKey`; `startShown`, `openStart()` in `activate()`; `tasksShown`, `openTasks()`, the TaskView, "tasks" in the history, the top bar's title |
| `app/Editor.qml` | Ctrl+Shift+T passed on from a locked page |
| `app/CalendarView.qml` | imports Daily.js and Tasks.js; daily notes and dated tasks among `notes` (`dailies()`, `dailyDay()`); labels via `Daily.noteLabel`; the `calDaily` button |
| `Api.qml`, `Service.qml`, `Scope.js` | `find` through Search.js; the `tasks` command; the `prepend` and `daily` commands; `move` into a page keeps its position (placePage) |
| `Help.js` | Ctrl+Shift+T, `prepend`, `daily`, the settings |
| `tests/import.test.cjs` | a front matter's tags are kept now |
| `tests/sidebar.test.cjs` | the Tasks tile in the sidebar's list |
| `tests/qml/tst_pages.qml` | test_6, test_6b: in memory first, grep while a text isn't read yet |
| `tests/run` | daily.test.cjs, properties.test.cjs |

Tests: `tests/daily.test.cjs`, `tests/properties.test.cjs`,
`tests/search.test.cjs`, `tests/tasks.test.cjs`, `tests/qml/tst_daily.qml`,
`tests/qml/tst_search.qml`, `tests/qml/tst_tasks.qml`.

**Performance.** Nothing while you type. The calendar looks through the daily
notes' page when it changes, and only while it's open (a few hundred titles,
well under a millisecond). Ctrl+Shift+T looks through the same titles once.
