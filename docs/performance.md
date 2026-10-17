# Typing without stalls (fork)

Measured with `qmlprofiler` on a copy of a real notes folder (1551 pages, a
1 MB `index.json`): a keystroke itself costs about 3 ms. What made typing
lag was work done every so often in between, on the window's thread. Three
of those are made smaller here:

| What | Before | Now |
| --- | --- | --- |
| Every page's text read after the start (`Workspace.scanTexts`): 200 pages made at once, some of them big | stalls up to ~330 ms for the first seconds | read 200 at a time as before, made into pages about 12 ms at a time (`scanTimer`); longest stall ~60 ms |
| The tree (`index.json`, a megabyte) written 0.3 s after every save, when only the page's time had changed | every pause in typing | `saveIndex(true)`: once writing pauses for 5 s; anything else is written soon, as before, and everything as the shell stops (`flush`) |
| `workspace.revision` changing (a tag, link or to-do changed): Quick Find, the page picker, the Library and the calendar worked out over every page while closed or hidden, and the sidebar gathered the Library just to count it | ~50 ms | only while shown; `Collection.count` counts; ~5 ms |

Times are from a fast computer; slower ones take a few times as long.

Not done yet (bigger, more to test): saving a long page makes every block
again (`Editor.serialize`, then the page's text, links, tags and things in
`Workspace.savePage`): ~45 ms on that page, 0.7 s after typing stops. Caching
each block's results would remove most of it.

The changes are in upstream files, marked `[fork]`:

* `Workspace.qml`: `saveIndex(lazy)`, `indexTimer.lazyInterval`, the call in
  `savePage`, `scanTexts` and `scanTimer`.
* `Collection.js`: `count`. `app/DocSidebar.qml`: `libraryCount` (and the
  import).
* `app/QuickFind.qml` (`recent`), `app/PagePicker.qml` (`results`),
  `app/LibraryView.qml` (`all`), `app/CalendarView.qml` (`notes`): `visible`.
* Tests: `tests/perf.test.cjs`, `tests/qml/tst_perf.qml`, the line in `tests/run`.

If an upstream release conflicts in one of these places, keep upstream's
version and put the `[fork]` change back (or leave it out: each one only
makes things quicker).
