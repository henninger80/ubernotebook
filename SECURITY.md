# Security

Uber Notebook runs as unsandboxed code in the Omarchy shell, like every shell
plugin, so here is exactly what it does, and how what it reads (a page synced
in, an import, an email, an agent's answer, the clipboard) is kept from doing
anything.

**No root, nothing installed or built, nothing that updates itself.** It never
asks for root, and runs no package manager and no updater. When there's a newer version it
says so, with the command that installs it (`omarchy plugin update
marcho78.uber-notebook && omarchy restart shell`), for you to run in a terminal, where it shows what
changes and asks first.

**The network, for three things.** A web bookmark you add: its page (http or
https, at most 2 MB, 15 seconds) and its picture, which the page names (https
only, at most 5 MB, kept only if it's a picture). Each is read only from a
host whose addresses are all public (not this computer or your network; a
name ending in "." isn't read: curl wouldn't keep to the address checked),
from the address looked up, past any proxy (which would look it up again for
itself); curl never follows a redirect: Uber Notebook does, five at most,
checking each one again (the picture's never). PDFs, Word files and imports
are made offline (below). GitHub's
list of the project's releases (https only, at most 2 MB, a minute after it
starts and once a day while Settings → About has it on; nothing of yours is
in it). And the agents you ask (they use their own connection). A link you
click opens in your browser only if it's http, https or mailto: a link in a
page never opens a file on your computer.

**Programs.** Every command it waits on (the recorder's ffmpeg too) runs by
absolute path, with an argument list, in its own process group
(`/usr/bin/setsid`, through `bash -c 'umask 077 && exec setsid ...'`, so
whatever it writes is yours alone) with a deadline and a budget for what it prints (counted
in characters, as they're kept; its errors too); when it's done (or overruns,
or Uber Notebook stops), anything it left running ends too (`/usr/bin/kill`
on its group), but `wl-copy`, which holds what you copied. A command gets only
the environment a tool needs (your home, your language, the Wayland, D-Bus
and PipeWire sockets, Hyprland's instance, a proxy you set) and
`PATH=/usr/bin`: nothing that changes how a shell or a tool starts
(`BASH_ENV`, `LD_PRELOAD`, `TAR_OPTIONS`...). A few are started and left to
themselves, with the shell's environment: opening a link or a file in its
app (`uwsm-app xdg-open`), the OSD, a process group's `kill`, and taking its
skill's links out as it stops. Note text is never part of a script, and
never on a command line either (below). Long text a program prints (a transcript, a list of files, an
agent's lines) comes back through the files helper as ASCII (JSON escapes):
Quickshell decodes what a program prints a piece at a time, and a character
cut between two pieces would come out wrong.

| Program | Why |
|---|---|
| `/usr/bin/bash` | fixed scripts: read files (each after a mark made new for each read, so what's in a file can't pass for another), list a folder, scan an import (names ended by NUL, each inside what was asked for), paste a picture, copy a file in, make a backup, a video's still, a recording made louder or written out |
| `/usr/bin/cat`, `/usr/bin/head`, `/usr/bin/stat`, `/usr/bin/test`, `/usr/bin/find`, `/usr/bin/grep` | read files; copy a file in (only a plain file, at most 8 GB; an email 64 MB) and paste a picture (at most 50 MB), each into a new file, never over one that's there; see what a file is before showing a PDF (at most 200 MB); find what you searched for (`grep -F -f -`: plain text, never a pattern, the word on its input) |
| `/usr/bin/mkdir`, `/usr/bin/cp`, `/usr/bin/mv`, `/usr/bin/rm` | make folders (its temporary ones new, never one that's there); pictures into an export or the Markdown copy (new files only); move things to `.trash`; take away only files Uber Notebook made (a copy that went wrong, a recording once it's written out, its temporary folders) |
| `/usr/bin/python3 -I -S bin/uber-notebook-files` | the files helper: read and write your notes (below, kept running while Uber Notebook runs); copy a picture in (only a plain file that's a picture Qt can show, at most 50 MB and 16384 px a side, as a new file; an agent's only from its own folder, through no link); copy in any other file an agent gives (the same way: only from its folder, through no link, at most 8 GB, as a new file); put a page's pictures in a document made of it and check it (below); make the Markdown copy's changes (below); unpack a zip you import, look into a backup and put one back, make and take out its launcher entry and its skill's links, read a file an agent names (below); look up a link's host (its name on its input) and send a notification (a reminder, an event's alert: over the session bus itself, its words on its input); make the Markdown copy's own files and folders from before yours alone; save a file you chose, or copy one there (an export, a picture: a new file yours alone, put in its place, checked) |
| `/usr/lib/chromium/chromium` (or Chrome's or Brave's own program), `/usr/lib/libreoffice/program/soffice`, `/usr/bin/unshare` | a page made a PDF (Chromium, headless) or a Word file (LibreOffice, headless), each only a plain program owned by root that no one else can change (never the `chromium` launcher, which reads your flags and extensions), with a profile of its own, and no network at all (below) |
| `/usr/bin/ln`, `/usr/bin/readlink`, `/usr/bin/flock` | once you turn the skill on, link it into agents' skill folders (`ln -sT`, only where nothing has that name), and take its own links out again (`rm -f`, only a link to its skill) when you turn it off, under a lock (`flock`, in `$XDG_RUNTIME_DIR`) the files helper waits for as it takes them out when Uber Notebook stops, marking that run stopped beside it (marks over a week old are cleared) so a link it asked for before then is never made, and leaving alone the links of a later run that's still going; after you turn meeting mode on, until voxtype has restarted, when voxtype's daemon started (your own processes in `/proc`, read only, with `/usr/bin/stat`) |
| `/usr/bin/wl-copy`, `/usr/bin/wl-paste` | copy (the text on its input, never as an argument); paste: the clipboard's text and HTML (at most 4 MB each), what's selected for a middle click, a picture |
| `/usr/bin/uwsm-app` with `xdg-open` | open a link (http, https, mailto), or one of Uber Notebook's own folders and files |
| `/usr/bin/hyprctl` | read Hyprland's bindings; register and remove the shortcuts and rules |
| `/usr/bin/omarchy-shell`, `/usr/bin/omarchy-menu`, `/usr/bin/omarchy-default-agent`, `/usr/bin/omarchy-agent-prompt` | the OSD; the menu for choosing your agent; which agent is Omarchy's default; an agent in a terminal (its request in a file of its own, below) |
| `/usr/bin/soffice`, `/usr/bin/pandoc` | turn a Word, OpenDocument or RTF file you import into HTML or Markdown (LibreOffice with a profile of its own and no network, `unshare --net`, where the system allows it: a document can name pictures on the web; pandoc with `--sandbox`: it reads only that file) |
| `/usr/bin/ffmpeg`, `/usr/bin/pactl` | record from your microphone (as every other command runs, with a deadline on the clock too; stopped with SIGINT, so it finishes its file); even out a voice; make a recording a WAV for voxtype; a video's still; a picture copied as PNG. A file it reads is read as a file, in one of a few formats (`-protocol_whitelist file -format_whitelist ...`): never a playlist or a list of other files. `pactl` lists the microphones |
| `/usr/bin/curl` | a bookmark's page and picture, one request a step, never redirected by curl, from the address looked up (`resolve` in its config), past any proxy (`--noproxy '*'`), the link and the address in its config on its input (`-K -`), never on its command line; GitHub's list of releases (`-q`: no `~/.curlrc`) |
| `/usr/bin/chmod` | `go-rwx`: a folder of Uber Notebook's own from before (a profile's notes, the backups') made yours alone, and a file it saves itself |
| `/usr/bin/voxtype` | `transcribe`; `meeting start` (no title: a meeting's title is its block's), `stop`, `pause`, `resume`, `list`, `export`; `config get meeting.enabled`, and `config set meeting.enabled true` when you turn meeting mode on (Uber Notebook doesn't restart voxtype: it reads the setting as it starts, and you restart it) |
| `/usr/bin/tar`, `/usr/bin/gzip`, `/usr/bin/mktemp` | make a backup (written into files of its own beside where it goes, then named when it's whole, never over a file that's there) |
| `/usr/bin/gio` | `trash`: automatic backups past how many are kept |

**Private to you.** Nothing Uber Notebook writes can be read by another
account on the computer. Your notes, their folders and attachments,
recordings, backups, exports and the Markdown copy's files are yours alone
(files 600, folders 700): the files helper writes them so; every program it
runs writes with `umask 077`; and a file you save or copy where you choose
(an export, a picture, a calendar or contacts file) is written new, yours
alone, beside it, then put in its place and checked, so a file that was
readable by others (644) is never left so with your words in it. A
profile's notes folder and the backups' folder from before (755) are made
700 when they're opened and checked; a profile kept in your home folder
itself has its own files and folders made so, never your home folder. The
Markdown copy's own files and folders from before (its pages, its
pictures, its folders) are made so too; the folder you chose for it, and
anything else in it, are left as you made them. Every profile's folder is
made so as Uber Notebook starts, not only the one you open. On a drive that
can't keep files private (an exFAT stick, some network shares), or in a
folder that isn't yours (its owner another account, whatever its mode
says), your notes, backups and Markdown copy aren't kept: a profile there
isn't opened, nothing of the profile before is shown or changed, and a
notice over the notes says so, with *Try again* and where to pick another
folder; a backup isn't made or put back there, the copy isn't written (each
time it copies, the drive is looked at again), and you're told, in the
window and with a notification for automatic backups and the copy, not
only in Settings. A profile's folder that was there before and isn't now (a
drive mounted in a folder of yours, not mounted) isn't made again, nor the
folder it's in, so nothing is put where that drive goes: it's said the
same way, and picking it again only tries it again (a new profile's folder
is made, and another folder you pick for one). The one case it can't
tell is a drive mounted on the notes folder itself: unmounted, the empty
folder it leaves looks like an empty profile, so pick a folder inside the
drive instead. A file you save there yourself (a PDF for a stick, a
picture to a phone) is still saved, and you're told
that drive can't keep it private. A page's export copies only the files
its pages use. Its working files, recordings and dictation on their way
included, are in your runtime folder (`$XDG_RUNTIME_DIR`, yours alone;
without one, a folder of its own in your cache, never `/tmp`), each folder
checked yours alone before it's used.

Nor are your notes' words on a command line, where every account on the
computer can read them (`ps`): what you search for goes on `grep`'s
input; a reminder or an event's alert is sent over the session bus by the
files helper, its words on its input (never through
`omarchy-notification-send` or `busctl`, which take them as arguments); a
link's host is looked up and its page fetched with the link on their input;
Claude Code's, Grok's and Codex's requests go on their input; an agent
opened in a terminal starts with a line naming a file of its own (600) its
request is in; a backup's list of profiles goes on its input; a meeting's
title stays with its block. Omarchy's own notifications then keep any
notification's words for a moment on a command line as they save it,
whatever app it's from, so a reminder or an event's alert says only that
one is due (and where to turn its details on), a click opening it, until you
turn on **Settings → Notifications → Show reminder details in notifications**. A command line still shows where things are:
a file's path (one you open, save or export is named there, its name from
its page's title too, as in any app), page ids, fixed words. The commands
agents run (`omarchy-shell uber-notebook-agent ...`) go through the Omarchy
shell's IPC, which takes only arguments: what an agent passes there is on
its own command line, as with any command you type.

**Your notes.** Their files (pages, their history, Pages' index, People, the
calendar, conversations with agents, notebooks) are read and written by the
files helper, kept running for your notes folder: the folder is opened once
(only a folder of yours), and every file is reached a folder at a time
without following a link, read only if it's a plain file within its size, and
written as a new file beside it, flushed to the disk, then put in its place,
its folder flushed too (after a power cut, a page as it was or as it is,
never half of it, never neither). A file that can't be read (a link, a pipe,
too big, not yours to read) is said, kept in its place, and never saved
over (each change to it not saved is said too); it isn't taken for one that
isn't there. A save of your notes that fails (a full disk) is kept and tried
again every 30 seconds, before another profile is opened and as the window
closes, whether its page is open or not (never a temporary or an exported
file): said once, then "Saved now" when it is, or a notification if it
still isn't as the window closes; an older text is never written over a
newer one. A file, a picture
or a site still on its way when another profile is opened isn't put into
that profile's notes (their pages may have the same ids), and an import, an
export or *Move to Pages* under way stops at its next step, making nothing
in the other and nothing from the two together.
If the helper stops or doesn't answer in a minute, that read or write is
done as before (by path, with Qt and `cat`), and after three failures it
isn't started again until Uber Notebook starts again.

**A page as a PDF or a Word file.** Made offline: the page is written as one
HTML document (every word on it escaped, links only to the web, email or the
document itself) in a folder of its own in `$XDG_RUNTIME_DIR` (only yours);
the files helper puts its pictures in (from `Pages/assets`, through no link,
plain pictures only: PNG, JPEG, GIF, WebP, BMP, or an SVG that names nothing
outside itself; each use of one counted, 512 MB in all, and one past what's
left never read) and checks every tag and attribute against what Uber
Notebook writes, refusing anything that would load something (a script, a
frame, a picture or a style from anywhere, a link it doesn't write). Then
Chromium or LibreOffice makes the file in a network of its own with nothing
in it (`unshare --net`, where the system allows it; else Chromium's every
request goes to a closed port, and the document's policy loads nothing), and
its folder is taken away. A PDF to print goes in a folder of its own there,
and what was printed a day before is taken away.

**Archives.** A zip you import and a backup you put back are opened by the
files helper, from one open file (only a plain file, not a link): what's in
them is written below a folder made for it, through folders opened without
following links, as new files only; nothing in them can name a place outside
that folder, be a link or a device, or take more than its room (an import 4
GB and 200,000 files and folders, the zips in it too; a profile put back 64
GB and 2,000,000), counted before they're made: every folder, every entry
(four for each file it may make, a zip's directory, zip64's too, checked
before it's read), and all a backup unpacks to, its other profiles too; the
helper itself may take at most 4 GB of memory. A zip you import is unpacked
on disk, in `~/.cache/uber-notebook` (the runtime folder is memory the whole
session shares); one left by an import that never finished is taken away a
day later. A backup is put back only if it's still the file that was looked
into (its SHA-256), into a new folder, and if anything goes wrong, only that
folder is taken away (if it's still the one it made). A link or a special
file in a backup (one synced into a profile, say) is left out when it's put
back, and said; a sparse file (its holes would be written out whole) refuses
the backup.

**Your agent.** In the panel, Claude Code, Grok and Codex work through Uber
Notebook's commands: they read and change your notes, as you ask.

- Claude Code: with your own setup, as in your terminal (your plugins and
  MCP servers, CLAUDE.md, the allow rules in your Claude Code settings,
  which apply here too; only your own settings, never ones in the folder it
  works in: `--setting-sources user`), Uber Notebook's commands, writing
  files in its own folder and reading Uber Notebook's skill allowed, and its
  permission mode set to ask (`--permission-mode manual`, whatever your
  settings' default mode). Anything else (a web page, a web search, a
  command, one of your plugins' or connectors' tools, a file elsewhere) it
  asks for, and you're asked in the panel. What it is comes from the tool
  itself (Claude Code's tool, Grok's kind for it), never from what the tool
  is given: a connector's tool is asked about as that tool, whatever its
  input says. A command is shown whole (a character you couldn't see, or a
  blank that isn't a plain space, written out, each line break marked, a run of blank lines said, how many lines it
  is said, its scrollbar in sight): *Allow this command*, *Allow shell for
  this conversation* (any command it runs until the conversation ends: a
  program's name is no boundary, `git -c` runs anything) or *No*; **Settings
  → AI → Commands** can allow every command for that agent, off unless you
  turn it on. A command runs programs that can read and change any file you
  can (your notes and Uber Notebook's settings too) and use the network. A
  site, searching or a tool: *Allow once*, *Always* (for that agent and that
  site, searching, or that tool) or *No*; a tool it doesn't know: named,
  all it was given shown, once only. Its request, and your answers, go on
  its input, not its command line.
- Grok: over its agent protocol (ACP), in its sandbox (a profile in its
  folder's `.grok/sandbox.toml`: it reads only its folder, the system's and
  Uber Notebook's skill (the file its request tells it to read), writes only
  there and in temp, and reaches the shell's socket for Uber Notebook's
  commands), with Always-approve off for these runs whatever your
  Grok settings say: anything beyond what it allows by itself (its read-only
  commands, in the sandbox) it asks for, and you're asked in the panel, as
  for Claude Code; Uber Notebook's own commands, each alone
  (`omarchy-shell uber-notebook-agent …` with nothing chained to it), and
  its own files in its conversation's folder aren't asked about, as Claude
  Code's aren't. The commands it runs have the network (its sandbox
  profile leaves it on). Allow rules saved in your own Grok settings still
  apply. Its profile is written by the files helper: a link put there is
  replaced, never written through.
- Codex: `--approve-for-me` (its sandbox: it writes only in its own folder, with
  no network; anything else is reviewed by Codex's own reviewer). The
  sandbox's no network keeps Uber Notebook's commands from the shell too, so
  it's told to run those outside it, each reviewed so.
- The panel's agent calls Uber Notebook's commands under a name of their
  own, `omarchy-shell uber-notebook-agent`, and those read and change your
  notes (pages, People, the calendar, templates), not Uber Notebook's
  settings (the permissions you give agents among them), profiles or
  backups; a file one takes comes only from the agent's folder: Markdown
  read by the files helper first (only a plain file, at most 2 MB), a
  picture or any other file (an email, a video, a PDF) copied in by it,
  every step from the folder through no link; a picture Grok made with its
  image tool also from its own session for that conversation
  (`~/.grok/sessions/<its folder>/`), only a real picture, the same way; a
  file from anywhere else only once you say yes in the panel (*Allow once*,
  or *Always from* its folder, kept in Settings → AI; never offered for your
  home folder itself or a hidden one like `~/.ssh`; a file in a profile's
  notes folder, any of them, or the backups folder is asked about each time,
  *Allow once* only, whatever you've said Always to), the command done then,
  the file itself through no link; with no
  agent working in the panel, they do nothing. Taking things away is asked
  in the panel, one question for each thing: pages to the trash (*Allow
  once*, *Always*, *No*), and a person, an event or a tag removed, a
  person's detail (a field emptied, a number or an email taken off) or an
  event's place or notes emptied (*Allow once*, *Allow for this
  conversation*, *No*: never for good; a yes to taking people or events
  out covers their details, not the other way round; a value with no
  letters or digits in it, "." say, counts as emptying). A
  question belongs to the conversation that asked: *Allow for this
  conversation* is kept there, and when it ends (a new one, another page's,
  another profile), what it asked and you haven't answered is answered No.
  Yours, a script's and a terminal's agent's (`omarchy-shell uber-notebook`)
  go on as always meanwhile. Claude Code is held to the panel's name by its
  permission rules until you allow it the shell; with a shell (Grok's and
  Codex's own, or Claude Code's once allowed), an agent can call the other,
  which is yours: it changes settings and folders (where the Markdown copy
  and backups go among them), switches profiles, imports any folder and
  puts back a backup, and it can change your files directly too, so a
  shell allowed is a shell allowed. Grok asks you before each command
  (unless you've allowed its shell); for Codex, its own reviewer is all
  that stands in the way.
- A link an agent puts on a page is kept as its link. Uber Notebook contacts
  its site, for its title and picture, only with your yes, asked in the
  panel for each link: *Allow once* (that link), *Always for* that site
  (that agent, that exact site, https only), or *No*. A redirect is followed, and a picture fetched, only
  from a site it may contact. **Settings → AI** lists the sites you've
  allowed, to take back; an agent can't change them. A card that wasn't read
  says *Get its title and picture*: a click reads it then.
- Each is found where it's installed (the folders on your PATH as the shell
  started, links resolved: a plain executable file owned by you or root that no
  one else can change, in a folder no one else can change) and run by that
  full path, in a folder of its own for each conversation under
  `$XDG_RUNTIME_DIR/uber-notebook-agent` (taken away once unused for two
  days), with
  your environment but what changes how a program starts.
- What it prints is read in pieces (made ASCII by the files helper first, so
  no character is cut in two), a line at most 4 MB, 64 MB in all, counted
  as it prints them, before they're made ASCII; its
  answer is shown as text Qt draws without fetching anything (no pictures, any
  HTML as text, links only to the web or email).

The other agents open in a terminal (`/usr/bin/omarchy-agent-prompt`, as Omarchy
runs them, with their approval prompts off).

**Files.** Uber Notebook writes inside its notes folder, and, outside it, only:
its launcher entry, `~/.local/share/applications/marcho78-uber-notebook.desktop`
(made only where there's nothing of that name; taken out as it stops, only if
it's exactly what was made); once you turn the skill on, a link named
`uber-notebook` to its skill in each of `~/.agents/skills`, `~/.claude/skills`,
`~/.codex/skills`, `~/.hermes/skills` and `~/.pi/agent/skills` that exists
(never over anything already called that; taken out only if it still links to
its skill, when it stops or you turn it off); `~/.config/omarchy/defaults/agent`
when you choose your agent; voxtype's `meeting.enabled` when you turn meeting
mode on; the Markdown copy, in the folder you choose (never over, or taking
away, a file you edited there: each change is made by the files helper only
to a file still as the copy wrote it, checked on its bytes (SHA-256) as it's
moved aside, else it's put back, yours, and its page's copy goes beside it;
its list of what it wrote is written by the files helper, a link there
replaced, never written through (the folder you chose may itself be a link
to where you keep it; nothing below it is followed); pictures never copied through a linked
folder); and exports and backups where you say. Its settings are written by
the Omarchy shell to Uber Notebook's entry in `shell.json`.

**What it reads.** Every file is checked as it's read (`Library.js`,
`Workspace.js`: types, sizes, counts, known values, UUIDs, a tree with no block
or page inside itself). The text of every block is cut down to the formatting
Uber Notebook writes itself (no pictures, stylesheets or scripts in text,
every look a value it would write, links only to the web, email or Uber
Notebook itself), so a damaged, hand-edited or synced-in page can't make it
load anything. What you paste (Ctrl+V, or a middle click for what's selected)
is read with `wl-paste` and cut down before Qt reads it: its writing and how
it's laid out, nothing Qt would load (a page copied from the web can't make
Uber Notebook fetch its pictures). An email's HTML is rebuilt from a short list of tags. Equations
and diagrams have budgets (a drawing too big is said, not drawn), and so does
everything that reads text someone else wrote (imports, emails, contacts,
code), and a page's synced blocks in an export or a Markdown copy (50 at
most, 4 million characters, never the page itself; 16 million in all the
pages of a copy's pass). Reading a page's
formatting, and Pages' tree, takes time in step with their size: no page or
index can hold up the shell. Every title, label and name is drawn as plain
text.

**Not done yet.** These are done by path, with standard tools, so a program
running as you that swaps a folder for a link at the right moment could
redirect them: moving a page to the trash (`mv`); copying a file (not a
picture) in (a new file only); listing and pruning a page's history; search
(`grep`); a backup; saving where you say; the pictures an export or the
Markdown copy takes; its launcher entry's and skill links' folders (a link
to one is followed); the demo's old folder, moved to the Trash by its name
(only "demo" folders in Uber Notebook's own data folder); and your notes
themselves when the files helper can't run. Anything that can write in the
Markdown copy's folder can also change its list of what it wrote
(`.uber-notebook-mirror.json`). Codex in the panel can read any file you
can (its sandbox reads everywhere). A file you open or save names itself
on the command line of the program that does it (`cp`, `xdg-open`, the
app it opens in), as in any app, an export's name (its page's title) too.
