# Uber Notebook for Omarchy

![Uber Notebook in 45 seconds: Pages and blocks, your agent on the page, paper notebooks, the calendar and habits, plain files](motion-graphics/uber-notebook-loop.gif)

![Uber Notebook: Pages with Ctrl+J asking your agent, a paper notebook behind](screenshots/00-banner.png)

Your notes, in your Omarchy shell: **Pages**, a workspace of pages made of blocks, and **Notebooks** that look like paper.
Everything is saved as plain files you own, and your AI agent works on the page with you.

## Features

* **Pages and blocks.** Type `/` for any block, drag ⋮⋮ to move it, put blocks inside blocks and pages inside pages, side by side in columns.
* **Every kind of block.** To-dos, toggles, callouts, code, tables, boards, mind maps, sketches, equations, diagrams, galleries, files and PDFs, emails, bookmarks.
* **Notebooks on paper.** Covers, ruled or grid paper, seven pens, pages that turn, drawing on the page; any notebook moves to Pages in a click.
* **Templates and planners.** Daily, weekly and monthly planners, a habit tracker, a journal, meeting notes and more, and templates of your own. A notebook of planners turns to the next day, week or month.
* **Calendar and reminders.** Month, week, agenda and compact views, events typed in plain words, alerts, and `@` reminders on any line.
* **People.** Your contacts, on your computer with no account: `.vcf` and `.csv` import, and `@` a name on any page.
* **Library.** Everything on your pages in one place: links, files, pictures, audio, sketches, people and emails.
* **Projects, tags and history.** A status and a due date on a page, `#tags` in any line, Ctrl+P to find a page, earlier versions kept.
* **Dictation and meetings.** Audio notes, dictation and meetings, written out by voxtype, Omarchy's dictation.
* **Your agent on the page.** Ctrl+J asks Claude Code, Codex or Grok in a panel; other agents open in a terminal; the skill works with any agent.
* **Quick notes.** Super+Alt+N from anywhere, into your Pages Inbox.
* **Profiles and backups.** Notes kept apart (personal, work, a client, the demo), backed up by hand or on a schedule, put back on a new computer.
* **In and out.** Import Notion, Obsidian, Markdown, HTML, Evernote and Word; export a page as PDF, Word or Markdown, or print it.
* **A Markdown copy.** Every page kept as a Markdown file in a folder, for Obsidian, git or grep.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="screenshots/02-pages.webp" alt="The demo's welcome page in Pages: the sidebar with projects, tags and pages, and an audio note with its words"><br>Pages: the sidebar and a page</td>
    <td width="50%"><img src="screenshots/03-ask-your-agent.webp" alt="Ask your agent: what to do with this page, suggestions, and Claude with its model and effort"><br>Ctrl+J: ask your agent</td>
  </tr>
  <tr>
    <td width="50%"><img src="screenshots/06-this-week.webp" alt="This week: today's and tomorrow's events, the top three, habits to tick and to-dos due soon"><br>This week: agendas, habits and to-dos</td>
    <td width="50%"><img src="screenshots/07-calendar-month.webp" alt="The calendar's month: weekly syncs, a dentist, run club and a trip across three days"><br>The calendar</td>
  </tr>
  <tr>
    <td width="50%"><img src="screenshots/09-library.webp" alt="The Library: files, pictures, audio, sketches, people and emails from every page, with filters"><br>The Library</td>
    <td width="50%"><img src="screenshots/12-slash-menu.webp" alt="The &quot;/&quot; menu: callout, divider, code, table, sketch, and planning blocks: agenda, event, habit"><br>The / menu</td>
  </tr>
</table>

More in [`screenshots/`](screenshots/): People, an event, templates, Settings, the shelf and the paper notebooks.

## Requirements

Omarchy 4 (Quattro): the Omarchy shell on Quickshell 0.3 with Qt 6.11, and
Hyprland 0.56 or newer with its Lua configuration. Everything else it uses
ships with Omarchy: `wl-copy` and `wl-paste`, `grep`, `bash`, `uwsm-app` and
`xdg-open`, and the iA Writer and Noto fonts. Its own fonts come with it.
Nothing to build.

* Audio, video and the page sounds use Qt Multimedia (`qt6-multimedia`), which comes with Omarchy.
* `qt6-webengine` shows a PDF's pages on the page. It's optional: without it, a PDF shows as a file, to open in its app.
* Audio notes record with `ffmpeg`. Dictation, and audio notes written out, use voxtype (`omarchy voxtype install` if you haven't set it up), with the model you picked for it.
* A PDF export needs Chromium (Omarchy has it); a Word file, LibreOffice (the `libreoffice-fresh` package).

## Install

```bash
omarchy plugin add https://github.com/marcho78/ubernotebook.git --enable
```

No setup step, and your Hyprland config is not touched: Uber Notebook
registers its shortcuts and window rules while it runs and takes them back
out when you disable it. It's in your app launcher as *Uber Notebook*, and its
notebook icon goes on the right of the top bar: `omarchy bar move
marcho78.uber-notebook --section left` moves it, and Settings → General →
*Show Uber Notebook in the top bar* hides it.

## Getting started

1. Press **Super+N**, or click the notebook in the top bar. The first time, name your first profile and its folder, or **Explore the demo**.
2. It opens in **Pages**. **New page** at the top of the sidebar (**Ctrl+N**) makes a page.
3. Type **/** on a page for any kind of block. Drag **⋮⋮** beside a block to move it, or click it for its menu.
4. **Ctrl+J** asks your agent about the page, the blocks or the words you picked.
5. **Super+Alt+N** jots a quick note from anywhere. **Ctrl+P** finds a page; **Ctrl+,** opens Settings.

Help in the app covers the rest: **?** at the foot of the sidebar, or **Ctrl+/** (**F1**). It has every key, everything you can type, every block and the commands from a terminal, with a search.

Everything in detail (writing, templates, paper, where your notes are kept, the Markdown copy, settings, agents and scripts): [the guide](docs/guide.md).

## AI agents

Claude Code, Grok and Codex work in a panel on the page: **Ctrl+J**, say what
you'd like, and reply to go on. Each change is a step you can undo, and each
page keeps its conversation. Omarchy's other agents (OpenCode, Gemini,
Copilot...) open in a terminal. Each uses your own login. Pick the agent, its
model and effort in the ask box or in Settings → AI.

Agents, scripts and keybindings read and write your notes with
`omarchy-shell uber-notebook` commands, over the Omarchy shell's IPC (no MCP
server). The app does the writing, so a change shows up on the page as it's
made:

```bash
omarchy-shell uber-notebook find "words"
```

The skill that teaches agents these commands is off until you turn on
**Settings → AI → Enable Uber Notebook skill**. On, while Uber Notebook runs,
it's linked into `~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`,
`~/.hermes/skills` and `~/.pi/agent/skills` (where they exist), so your agents
know it wherever you use them. The panel's agent gets it either way. For any
other AI, Settings → AI → *Use with any AI* copies it.

Every command is in [`skills/uber-notebook/SKILL.md`](skills/uber-notebook/SKILL.md),
and `omarchy-shell uber-notebook help` lists them.

In a terminal, Claude Code asks before each command unless you allow them in
`~/.claude/settings.json` (leave `trash` out, so that one still asks):

```json
"permissions": {
  "allow": [
    "Bash(omarchy-shell uber-notebook find:*)", "Bash(omarchy-shell uber-notebook list:*)",
    "Bash(omarchy-shell uber-notebook read:*)", "Bash(omarchy-shell uber-notebook add:*)",
    "Bash(omarchy-shell uber-notebook addTo:*)", "Bash(omarchy-shell uber-notebook append:*)",
    "Bash(omarchy-shell uber-notebook blocks:*)", "Bash(omarchy-shell uber-notebook replace:*)",
    "Bash(omarchy-shell uber-notebook insertAfter:*)"
  ]
}
```

## Your notes

Each profile is a folder of plain files: `~/Documents/Uber Notebook` to start
with (`~/Uber Notebook` without a Documents folder), or the folder you give it.

```
Uber Notebook/
  Pages/                a JSON file for each page, named by its UUID; the calendar, People, history and pictures
  my-notebook-k3f9/     a notebook: a JSON file for each page, pictures beside them
  .trash/               what you threw away
  Markdown/             the Markdown copy, when it's on
```

* Files are written whole, to a temporary file that then replaces them, so a crash never leaves half a page. Nothing is deleted for good: the trash is `.trash`.
* **Profiles.** The profile menu at the top of the sidebar switches profiles (what's open is saved first), makes a new one, or opens Settings → Profiles. The demo is a profile of its own, in `~/.local/share/uber-notebook`.
* **Backups.** Settings → Backups puts the open profile, or every one, in a `.tar.gz` in `~/Documents/Uber Notebook Backups`, by hand or daily or weekly. *Restore* puts each profile back as a new one, changing nothing you have.
* **A Markdown copy.** Settings → Writing → *Keep a Markdown copy* keeps every page as a Markdown file in a folder. It goes one way: Uber Notebook writes it and never reads it.
* **What goes online.** A web bookmark's page and picture, when you add one; GitHub's list of releases, once a day (off in Settings → About), with nothing of yours in it; and the agents you ask. Pictures on the web in notes you import stay links.
* Uber Notebook was called Omanote while it was being made: notes from then open as they always did, their `omanote://` links included.

## Updating

When there's a newer version, the foot of the sidebar says so; a click shows
its notes and the command that installs it, to run in a terminal:
`omarchy plugin update marcho78.uber-notebook && omarchy restart shell`. It
shows what changes and asks before it applies them; then the Omarchy shell
restarts, so all of the new version runs. Uber Notebook never installs
anything itself.

Settings → What's new lists every release's notes, and after an update the
sidebar says once which version you're on.

## Security and privacy

* No root, nothing installed or built, nothing that updates itself: you run the update command yourself.
* It goes online only for a bookmark you add (public sites only), GitHub's list of releases (you can turn it off), and the agents you ask.
* Your notes are yours alone (files 600, folders 700), and their words never go on a command line, where other accounts could read them.
* Every program runs by its full path with only the environment it needs; exports are made with no network; what it reads (a synced page, an import, an email, the clipboard) can't make it load or run anything.
* In the panel, your agent changes your notes through Uber Notebook's commands, and asks you first for anything else: a site, a command, a file from elsewhere, taking something away.

Full details: [SECURITY.md](SECURITY.md). How it's built: [docs/how-it-works.md](docs/how-it-works.md).

## Known limitations

* Dragging across blocks picks whole blocks, as in Notion, not part of one and part of the next.
* Pages has no databases, live embeds of other sites, merged cells or syncing between computers. Columns are at a page's top level, not inside a toggle or a list.
* Find on a page (Ctrl+F) looks through the writing, not the title, table cells or mind maps; Ctrl+P looks through all of them.
* A page as big as a page can be (32 MB) of crafted formatting, synced in say, can keep the shell busy for minutes while it's read.
* Weeks start on Monday (ISO weeks) in planners, habits and calendars, whatever your locale says.
* A Word file has diagrams and equations as pictures, and LibreOffice's idea of some layouts (columns are a table).
* Notebooks get no new features, and have no tables, spell checking or PDF export; a drawing doesn't move with the text under it. *Move to Pages…* for those.
* In the panel, Codex has no network and writes only in its folder (*Open in a terminal* for more).
* A few things in your notes folder (the trash, copying files in, a page's history, search) still go by path: see *Not done yet* in [SECURITY.md](SECURITY.md).

## Uninstall

```bash
omarchy plugin remove marcho78.uber-notebook
```

Omarchy turns Uber Notebook off first: it writes anything waiting, takes its
shortcuts and window rules out of Hyprland, and removes its launcher entry,
agent skill and settings. Then its folder is deleted. Your notes are never
touched. What stays:

* each profile's notes, in the folder you gave it (`omarchy-shell uber-notebook profiles`, before uninstalling, lists where they all are)
* backups, in `~/Documents/Uber Notebook Backups` (or the folder set in Settings → Backups)
* the demo, in `~/.local/share/uber-notebook`
* voxtype's meeting mode, if you turned it on: `voxtype config set meeting.enabled false` turns it off

To remove everything for good, delete those folders after uninstalling.

## Development

```bash
tests/run          # every test: node, lua, and the views driven offscreen (qmltestrunner)
shaders/build      # recompile the shaders (needs qt6-shadertools)
sounds/make        # make the sounds again
```

`dev/` holds local tools and isn't in the repository. Before a release,
`node tests/agents/smoke.cjs` runs Grok, Claude Code and Codex for real, on
notes made for the run (it makes real requests on your accounts). The Omarchy
shell caches plugin QML, so after changing QML run `omarchy restart shell`.

## License

MIT. See [LICENSE](LICENSE). The fonts in `fonts/` keep their own licenses,
which come with them: Caveat, Patrick Hand and Lora under the SIL Open Font
License, Special Elite and Permanent Marker under the Apache License 2.0.
Equations are drawn by [MathJax](https://www.mathjax.org/) (`vendor/mathjax/`),
Copyright (c) 2017-2022 The MathJax Consortium, under the Apache License 2.0
(its `LICENSE`, and what's changed in it for Qt, are beside it).
