# Accounts & sync (fork)

This fork (henninger80/ubernotebook) keeps Uber Notebook's calendar the same
as Office 365's and Google's calendars, both ways. It all runs in Uber
Notebook itself: no script, no service of its own.

## What it does

* **Accounts:** Office 365 (Microsoft Graph, signed in with a code) and
  Google (Calendar, signed in in the browser with a client of your own, see
  below).
* **Calendars:** every calendar of both accounts is listed in
  Settings → Accounts & sync. You choose which ones are synced; each
  account's main calendar is on from the start. One calendar is the
  **default**: events made here go there.
* New, changed and deleted events go both ways at every sync. When an event
  was changed on both sides, the later change wins.
* Synced: the title, start, end, all-day, place, and repeats from there
  (daily, on weekdays, weekly, monthly, yearly, every n of those, until a
  day). Series the calendar can't repeat ("the second Tuesday", "five
  times") come as single events. The calendar's own repeating events stay
  here for now.
* Events from one calendar elsewhere **never** go to another one.
* Events from a calendar come in its color.
* An event given another calendar moves there at the next sync. Given
  "Here only", it stays here alone.
* A calendar turned off takes its events out of yours. They come back when
  it's turned on again.
* Safety: a calendar that has lost more than half of its linked events at
  once isn't synced (safety guard). Only the profile synced first is synced,
  never the demo. The window is 30 days back and 365 days ahead, and an
  event that only moved out of it isn't deleted.
* It syncs at the interval (5 to 60 minutes), two minutes after the shell
  starts, and 20 seconds after you change the calendar.

## Google ⇄ Office 365, unseen (bridge)

Settings → Accounts & sync → "Google ⇄ Office 365, unseen". On, Google's main
calendar leaves this app (it's turned off here) and, behind the scenes, Google's
main calendar and Office 365's are kept the same: a single event new, changed
or deleted on one is so on the other at the next sync; events that are equal
already are linked, not made twice. Repeating events stay where they are. Only
Office 365's calendar is shown. `Sync.planBridge` plans it; the pairs are in
`bridge.json`. A sync that would make more than 40 events on one side (once
paired) or lose more than half of the pairs is stopped (safety guard).

## Google: a client of your own

Google lends no public client for its Calendar API, so you need your own
(free, once):

1. https://console.cloud.google.com: make a new project.
2. APIs & Services → Library: turn on the **Google Calendar API** and the
   **Google Tasks API**.
3. OAuth consent screen: External, an app name and your email, yourself as
   a test user. Then **publish it ("In production")**: in Testing, Google's
   sign-ins run out after 7 days. Google then says "app not verified" at
   sign-in. For an app you alone use, go on past that.
4. Credentials → Create credentials → OAuth client ID → **Desktop app**.
5. Paste the client ID and secret into Settings → Accounts & sync → Google,
   then sign in.

Signing in opens Google's page in your browser, and Google sends you back to
`http://127.0.0.1:<port>`. A small listener there hears the answer and is
gone after it (QML has no TCP server). The sign-in is PKCE (S256) with a
state of its own.

## What's kept

`~/.local/state/uber-notebook-sync`, readable by you alone:

| File | What it is |
| --- | --- |
| `config.json` | on, interval, the profile, the default calendar, Google's client, the calendars (synced, color) |
| `links.json` | which event here is which event there, per calendar |
| `assign.json` | the calendar each event was given here |
| `tokens-o365.json`, `tokens-google.json` | the sign-ins |
| `last.json` | how the last sync went |

The first time, what `~/.local/bin/o365-calendar-sync` kept in
`~/.local/state/o365-sync` (the sign-in and the links) is taken over, and
left where it was.

## How it's built, and upstream updates

| File | What it is |
| --- | --- |
| `Sync.js` | the logic, plain JavaScript: both services' events made comparable, their repeats, the plan (what goes which way), PKCE |
| `Sync.qml` | in the service: accounts, signing in, HTTPS (XMLHttpRequest), the timers, the changes made on our calendar (`workspace.setCalendar`, as one change a calendar, so Ctrl+Z takes it back) and there |
| `app/SyncSettings.qml` | Settings → Accounts & sync |
| `tests/sync.test.cjs` | Sync.js |
| `tests/qml/tst_sync.qml` | Sync.qml and Settings, with both services played in the test |

It uses only what the calendar's own code already gives: `Calendar.js`
(`cleanEvent`, `withEvent`, `without`, `byId`, `cleanColor`) and the
workspace's `calendar`, `calendarRevision` and `setCalendar`. Upstream files
are touched only in places marked `[fork]`:

* `Service.qml`: two lines after `property alias backups: backupsItem`.
* `app/SettingsPanel.qml`: the `sync` entry in `sections` (before
  `whatsnew`), and the `SyncSettings { … }` line before
  `// ======== About ========`.
* `tests/run`: `node tests/sync.test.cjs` after the calendar's test.

To bring in an upstream release:

```
git fetch upstream
git merge upstream/main          # or: git merge v1.2.0
node tests/sync.test.cjs && tests/run
omarchy restart shell            # the service is kept loaded: a restart takes the new one
```

If a merge conflicts at a hook point, keep upstream's version and put the
`[fork]` lines back. If upstream changes the calendar functions above,
`Sync.qml` is the one place to follow it.

The plugin is a symlink from `~/.config/omarchy/plugins/marcho78.uber-notebook`
to this checkout. The shell's watcher doesn't follow the symlink: after
changing the window's files run `omarchy-shell shell rescanPlugins`, and
after changing the service's files run `omarchy restart shell`.
