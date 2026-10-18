# From Obsidian (fork)

Two things this fork brings over from Obsidian: a note's properties when it
comes in, and daily notes.

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

## The [fork] places

| File | What |
|---|---|
| `Daily.js`, `Properties.js` | new: the logic above |
| `Import.js` | imports Properties.js; the front matter's line in `fromMarkdown` |
| `Defaults.js` | `dailyParent`, `dailyTemplate`, `dailyByYear` |
| `app/DocView.qml` | imports Daily.js; `openDaily()`; Ctrl+Shift+T in `handleKey` |
| `app/Editor.qml` | Ctrl+Shift+T passed on from a locked page |
| `app/CalendarView.qml` | imports Daily.js; daily notes among `notes` (`dailies()`, `dailyDay()`); labels via `Daily.noteLabel`; the `calDaily` button |
| `Api.qml`, `Service.qml`, `Scope.js` | the `prepend` and `daily` commands; `move` into a page keeps its position (placePage) |
| `Help.js` | Ctrl+Shift+T, `prepend`, `daily`, the settings |
| `tests/import.test.cjs` | a front matter's tags are kept now |
| `tests/run` | daily.test.cjs, properties.test.cjs |

Tests: `tests/daily.test.cjs`, `tests/properties.test.cjs`,
`tests/qml/tst_daily.qml`.

**Performance.** Nothing while you type. The calendar looks through the daily
notes' page when it changes, and only while it's open (a few hundred titles,
well under a millisecond). Ctrl+Shift+T looks through the same titles once.
