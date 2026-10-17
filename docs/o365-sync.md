# Office 365 calendar sync (fork)

This fork (henninger80/ubernotebook) keeps Uber Notebook's calendar and an
Office 365 calendar the same both ways, through Microsoft Graph.

## What it does

* New, changed and deleted events go both ways at every sync. When an event
  was changed on both sides, the later change wins.
* Synced: the title, start, end, all-day and place.
* Office 365's repeating events come in as repeating events (daily, weekdays,
  weekly, monthly, yearly). Series the calendar can't repeat ("every two
  weeks", "the second Tuesday") come in as single events. The calendar's own
  repeating events aren't sent to Office 365.
* Only the profile that was synced first is synced. With another profile
  open, or the demo, the sync waits.
* It stops when more than half of the linked events vanish at once (safety
  guard), and it never runs twice at the same time (a lock).
* The window is 30 days back and 365 days ahead.

## Using it

Settings → **Office 365**: sign in (a code for Microsoft's page, which opens
in your browser), sync on or off, how often (5 to 60 minutes), and the last
sync's result, with **Sync now**. While it's on and you're signed in, the
first sync runs two minutes after the shell starts, then at the interval.

From a terminal, the same script:

```
bin/uber-notebook-o365 status            # sign-in, links, the last run
bin/uber-notebook-o365 sync --dry-run    # what would change, nothing changed
bin/uber-notebook-o365 login             # sign in from the terminal
```

Everything is kept in `~/.local/state/o365-sync`:
`token.json` (the sign-in, 0600), `map.json` (which event is which),
`config.json` (the settings) and `last.json` (the last run).

## How it's built, and upstream updates

The aim is that upstream releases merge without conflicts. Everything is in
files of its own:

| File | What it is |
| --- | --- |
| `bin/uber-notebook-o365` | the sync engine (Python, standard library only); it talks to the Notebook only through its public IPC commands (`events`, `addEvent`, `editEvent`, `removeEvent`, `profiles`) |
| `O365.qml` | runs the engine on a timer and for Settings |
| `app/O365Settings.qml` | the Office 365 section in Settings |
| `tests/o365.test.py` | the engine against an in-memory calendar and Office 365 |
| `tests/qml/tst_o365.qml` | O365.qml and the Settings section (runs with tests/run) |

Upstream files are touched in two places only, each marked `[fork]`:

* `Service.qml`: two lines after `property alias backups: backupsItem`
  (the `O365 { … }` item and `property alias o365`).
* `app/SettingsPanel.qml`: the `o365` entry in `sections` (before
  `whatsnew`), and the `O365Settings { … }` line before
  `// ======== About ========`.

To bring in an upstream release:

```
git fetch upstream
git merge upstream/main          # or: git merge v1.2.0
python3 -I tests/o365.test.py && tests/run
omarchy-shell shell rescanPlugins   # reload the plugin (see below)
```

If a merge conflicts in one of the two hook points, keep upstream's version
and put the `[fork]` lines back in. If upstream renames the IPC commands
the engine uses (`omarchy-shell uber-notebook help` lists them), the engine
is the one place to change.

The plugin is a symlink from `~/.config/omarchy/plugins/marcho78.uber-notebook`
to this checkout. The shell's watcher doesn't follow the symlink, so after
an edit or a merge, reload with `omarchy-shell shell rescanPlugins`.
