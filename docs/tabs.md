# Tabs and the split view (fork)

Pages can show several pages at once: tabs above the page, and a second pane
beside the first, with tabs of its own.

## Tabs

- **Ctrl+T** opens a new tab on what's shown, with Search open to go elsewhere.
- **Ctrl+click** on a page link, or on a page in the sidebar, opens it in a new
  tab. So does the middle mouse button on a page in the sidebar, and "Open in a
  new tab" in a page's sidebar menu.
- **Ctrl+W** closes the tab. **Ctrl+Tab** and **Ctrl+Shift+Tab** (or
  Ctrl+PageDown and Ctrl+PageUp) move between tabs. Ctrl+1 to Ctrl+8 go to that
  tab, and Ctrl+9 to the last one.
- Each tab has its own Back and Forward (Alt+← and Alt+→).
- The strip shows while there's more than one tab. Drag a tab to move it.
- The tabs are kept per profile (settings `tabs` and `tabAt`) and come back next
  time. There are at most 12; when there are more, the oldest go.

## The split view

- **Ctrl+Shift+S**, or the split button in the bar, opens what's shown beside it
  in a second pane. Press it again, or close the pane's last tab, to close it.
- **Ctrl+Shift+click** on a page link, or on a page in the sidebar, opens the page
  in the other pane. So does "Open beside" in a page's sidebar menu.
- Drag the line between the panes to resize them (25–75 %). Double-click the line
  to split them evenly again. The width is kept in `splitWidth`.
- If the same page is open in both panes, only the pane where it was opened first
  can change it. The other pane shows it **read only** and updates it each time
  it's saved. That way the page is never written from two places. When the first
  pane moves to another page, the second can change it again.
- Commands (CLI, agents) that change an open page change it in the pane that can
  edit it.
- While the second pane is open, its tabs are kept (`split`, `splitTabs`,
  `splitTabAt`). Closing the pane drops them.

## Code

- `Tabs.js`: the tab logic (tests/tabs.test.cjs).
- `app/PageTabs.qml`: the strip.
- `app/SplitPane.qml`: the second DocView.
- `tests/qml/tst_tabs.qml`.

The `[fork]` hooks are in:

- `app/DocView.qml`: the tabs/split section after `open()`, plus `activate`,
  `commit`, `markDirty`, `leaveFolder`, the command functions, the top bar,
  `rowMenu` and `handleKey`.
- `app/App.qml`: the `SplitPane`, and `docs`' right margin.
- `app/Editor.qml`: `openIn` and `tabKey`.
- `app/DocBlock.qml`: Ctrl/Ctrl+Shift link clicks.
- `app/DocSidebar.qml`: row and favorite clicks.
- `Defaults.js`, `Settings.js` (the `tabs` type and PROFILE_KEYS), `Help.js`.
