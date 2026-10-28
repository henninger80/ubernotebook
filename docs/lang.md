# The app in German (fork)

Uber Notebook shows its menus, buttons, tips and messages in German when the
system's language is German (`Qt.locale()`, e.g. `LANG=de_DE.UTF-8`), and in
English otherwise.

- `Lang.js`: `t(text)` gives a text's German, or the English as it is when
  there's none. A page's own words never match, so they stay as they are.
- `Lang_de.js`: the dictionary, each English text as the app writes it
  (fragments of composed texts with their spaces, `" pages"`), and its German.
- The QML files call `Lang.t("…")` where a text is shown (`text:`, `tip:`,
  `hint:`, `label:`, `note:`, `toast(…)` …), and `Lang.t(modelData.label)`
  for lists from the JS files (the "/" menu in Docs.js, the sidebar).
  Docs.js finds "/" commands by their German names too.
- `bin/lang wrap` puts `Lang.t()` around every shown text the dictionary has
  (run it after a merge from upstream, or after adding words);
  `bin/lang missing` lists shown texts without German.
- Not translated yet: the help (Help.js), dates and weekday names (Dates.js;
  they also go into pages and templates), and texts built in multi-line
  bindings and JS functions. Replies to the CLI and agents stay English.
- Tests run in English: `tests/run` sets `LC_ALL=en_US.UTF-8` for the QML tests.
