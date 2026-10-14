# How it works

Uber Notebook is QML and JavaScript, two small shaders and a small Hyprland Lua
file; nothing is built on your machine. It runs inside the Omarchy shell: a
service with the settings, the Hyprland registration and the notebooks on
disk (`Service.qml`, `Store.qml`), a panel with the notebook window and the
quick-note card (`Notebook.qml`, `app/`), and the icon in the bar.

* **The page** is a column of blocks, each its own Qt rich-text editor
  (`app/Block.qml`); `app/Editor.qml` decides what keys do across them (Enter
  splits a block, Backspace at its start joins it to the one above, the
  arrows move between them), formats text, pastes, picks whole blocks and
  keeps the undo history. Formatting works on the selection's HTML, read into
  runs of text and written back (`Html.js`), so bolding a heading-sized word
  together with body text keeps both sizes.
* **Text on the lines.** Every line of every block has a fixed height, a whole
  number of rules, and Qt puts a fixed-height line's baseline at four fifths
  of it, whatever the font: that's where the paper's rules are drawn. A title
  takes two rules and moves down a fifth of one, so it sits on the second.
* **The paper** is a fragment shader (`shaders/paper.frag`): the color, a
  grain of noise, kraft's fibers, and the pattern, with each rule one device
  pixel wide. The covers are another (`shaders/cover.frag`): leather's
  pebbles, linen's weave, kraft's fibers, the composition book's marbling,
  stitching and the spine. The spiral, tabs, checkboxes and ticks are drawn
  with Qt Quick Shapes.
* **Turning a page** takes a picture of the page, puts the next page under it
  and turns the picture over the binding in 3D with light and shadow across
  it; turning back, the earlier page comes over a picture of this one. The
  cover opens the same way, around the spine.
* **Pages** is the same editor in another layout: blocks with natural
  spacing instead of ruled lines (`app/DocBlock.qml`), each block's depth
  telling which block it's inside. `Workspace.js` turns a page's tree of
  blocks into that list and back, keeps depths that make sense, and checks
  page files and the tree of pages; `Workspace.qml` reads and writes them,
  through the same atomic writes as the notebooks; `Docs.js` has Pages' type,
  colors and "/" commands. `Dates.js` reads the dates typed after "@",
  `Emoji.js` has the emoji names for ":", and `Import.js` reads the notes you
  bring in. Code is stored as plain text and colored as it's shown, by
  `Highlight.js`: a small reader for each language that finds its comments,
  strings, numbers, keywords, types, functions and tags, and never changes a
  character (it colors again a moment after you stop typing). `Api.qml`
  answers the commands agents and scripts send over IPC, through the same
  store as the window, and `Agent.js` writes what *Ask agent* hands your agent.
  A mind map keeps its ideas as an outline; `Mindmap.js` reads it (and
  Mermaid's), changes it and lays it out, and `app/MindMap.qml` draws it and
  lets you write on it. A table keeps its rows of cells (each a little rich
  text), whether its first row is a header, and its columns' widths;
  `Table.js` cleans and changes it (its cells' colors too, which go with
  their rows and columns; and it reads spreadsheet cells and writes
  Markdown, which has no colors), and `app/TableBlock.qml` draws it and lets you write in it.
  `Workspace.qml` keeps each page's earlier versions in `Pages/history/`, and
  `app/HistoryPanel.qml` shows them and puts one back. A sketch keeps its
  strokes in its own units (1000 wide), so it scales with the page;
  `Sketch.js` cleans it, finds what the eraser touches and writes it as SVG,
  and `app/SketchBlock.qml` draws it and lets you draw on it. An audio note
  keeps its recording's file in `Pages/assets`, its length, its waveform and
  what was said; `Audio.js` cleans it, reads ffmpeg's levels and voxtype's
  output, `Recorder.qml` runs the microphone (one recording at a time) and
  voxtype, `app/AudioBlock.qml` records and plays it, and
  `app/RecordingBar.qml` is the bar at the foot while dictating. The calendar
  keeps its events in `Pages/calendar.json` (in the computer's own time);
  `Calendar.js` cleans them, works out repeats, lays out a day, reads what's
  typed ("Lunch fri 12:30"), finds the alerts and writes `.ics`;
  `app/CalendarView.qml` is the month, the week and the agenda,
  `app/EventPop.qml` changes an event, `app/QuickAddPop.qml` adds one, and
  `app/CalendarBlock.qml` is an agenda or an event on a page. The newer
  blocks keep what they are in `data`: `Board.js`, `Files.js` and
  `Bookmark.js` clean and change theirs, and `app/BoardBlock.qml`,
  `app/FileBlock.qml` (with Qt's PDF view), `app/VideoBlock.qml`,
  `app/BookmarkBlock.qml`, `app/ButtonBlock.qml` and `app/SyncedBlock.qml`
  (an editor of its own, showing the page its blocks are on) draw them, on
  `app/DataCard.qml`'s data and colors. The Library is `Collection.js`
  (what each kind of block puts in it, kept in each page's index entry as
  the page is saved, then gathered, sorted and filtered) and
  `app/LibraryView.qml`; a new kind of block with something worth finding
  again is a line in `Collection.ofBlock`. People are `Contacts.js` (they're
  kept in `Pages/contacts.json`; it reads vCard 2.1 to 4.0 and Google's and
  Outlook's CSV, matches an import to who's there, writes vCard, and finds
  people), `app/PeopleView.qml` (the list and the card), `app/ContactPop.qml`
  (a person named on a page, clicked), `app/ContactBlock.qml` (/contact) and
  `app/Avatar.qml`; a person on a page is a link to `uber-notebook://contact/<id>`,
  and `Html.linkEmails` makes emails links. An email block is `Email.js`
  (it reads an .eml: headers in any charset, plain and HTML bodies in
  base64 or quoted-printable, attachments; makes its HTML safe; and says
  what the block keeps) and `app/EmailBlock.qml`; its attachments are
  written out with `base64 -d`. A meeting
  keeps voxtype's id for it, what voxtype wrote out and the names you gave
  its speakers; `Meeting.js` cleans it and reads voxtype's export, list and
  state file, `Meetings.qml` follows voxtype's meeting
  (`$XDG_RUNTIME_DIR/voxtype/meeting_state`) and runs its commands, and
  `app/MeetingBlock.qml` shows it.
* **Blocks** (`Blocks.js`) know how Enter, Backspace and numbering work for
  each kind; **templates**, and the dates planners go on by, are in
  `Templates.js`; **papers, pens and inks** are in `Papers.js`, **covers** in
  `Covers.js`, and **what the files may hold** in `Library.js`, which checks
  everything read from disk before anything uses it.
* `hypr/uber-notebook.lua` registers the shortcuts as messages to the service over
  Hyprland's event socket (`hl.dsp.event`), and window rules that float the
  notebook in the middle of the screen at your size, keep it fully opaque
  (paper isn't see-through), float the picture picker, and take the border
  and shadow off the quick-note card. The service runs it with `hyprctl eval`
  when the shell starts, after every Hyprland config reload, and when you
  change the shortcuts or window settings; disabling Uber Notebook removes it all.
* **Sounds** are made from noise and sine waves by `sounds/make`, so there are
  no recordings in it.
