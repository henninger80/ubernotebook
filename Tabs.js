// Tabs.js - (fork) pages open side by side in Pages: tabs above the page,
// each with its own back and forward, and the view split in two, a pane
// beside the first with tabs of its own (DocView.qml, PageTabs.qml,
// App.qml; docs/tabs.md).
//
// A tab is { history, at }: what it showed, as DocView's history is (a
// page's id, "tag:<name>", "calendar<day>", "library<kind>", "people<id>",
// "tasks", "templates"), and where in it it is. The tab you're on keeps its
// history in the view while it's open; the others keep theirs here.
//
// In the settings each pane's tabs are kept as what each one shows (`tabs`,
// `tabAt`; the pane beside it's `splitTabs`, `splitTabAt`), so they're
// there again next time.
//
// Shared with tests/tabs.test.cjs, so keep it plain JavaScript with no QML
// or Node APIs.
.pragma library

// (More than this many tabs, and the first ones go: a tab opened is wanted
// more than one from long ago.)
var MOST = 12

// What a tab may show, as it's kept: one of the ids above.
function isId(id) {
  if (typeof id !== "string" || id.length === 0 || id.length > 120) return false
  if (/[\u0000-\u001f\u007f]/.test(id)) return false
  return /^([0-9a-f-]{36}|tag:.+|calendar(:[0-9-]+)?|library(:[a-z]+)?|people(:[0-9a-z-]+)?|tasks|templates)$/.test(id)
}

// Tabs as they're kept: ids, each a tab, at most MOST of them.
function clean(list) {
  if (!Array.isArray(list)) return []
  return list.filter(isId).slice(-MOST)
}

// The tabs kept, as tabs, and the one you were on.
function fromKept(ids, at) {
  var list = clean(ids)
  var tabs = list.map(function(id) { return { history: [id], at: 0 } })
  var i = typeof at === "number" && at >= 0 && at < tabs.length ? Math.floor(at) : tabs.length - 1
  return { tabs: tabs, at: Math.max(0, i) }
}

// What each tab shows, the one you're on as the view has it now.
function shown(tabs, at, history, historyAt) {
  return tabs.map(function(t, i) {
    var h = i === at ? history : t.history
    var k = i === at ? historyAt : t.at
    return h && k >= 0 && k < h.length ? h[k] : ""
  })
}

// To keep: what each tab shows (the empty ones left out), and the one you're on.
function kept(tabs, at, history, historyAt) {
  var ids = shown(tabs, at, history, historyAt)
  var out = []
  var outAt = 0
  ids.forEach(function(id, i) {
    if (!isId(id)) return
    if (i === at) outAt = out.length
    out.push(id)
  })
  var drop = Math.max(0, out.length - MOST)
  return { tabs: out.slice(drop), at: Math.max(0, outAt - drop) }
}

// The tab you're on, its history as the view has it now: kept in it.
function stash(tabs, at, history, historyAt) {
  var out = tabs.slice()
  if (at >= 0 && at < out.length) out[at] = { history: history.slice(), at: historyAt }
  return out
}

// A new tab after the one you're on (or at the end): { tabs, at }. The tab
// you were on keeps its history.
function opened(tabs, at, history, historyAt, end) {
  var out = stash(tabs, at, history, historyAt)
  var i = end || at < 0 ? out.length : at + 1
  out.splice(i, 0, { history: [], at: -1 })
  while (out.length > MOST) { out.shift(); i-- }
  return { tabs: out, at: Math.max(0, i) }
}

// A tab closed: { tabs, at, history, historyAt, open } with the tab you're
// on then (the one after it, else the one before, when it's the one
// closed), and what to open: its id, or "" when you stay where you are. The
// last tab isn't closed: null.
function closed(tabs, at, history, historyAt, i) {
  if (tabs.length <= 1 || i < 0 || i >= tabs.length) return null
  var out = stash(tabs, at, history, historyAt)
  out.splice(i, 1)
  var next = i < at ? at - 1 : i === at ? Math.min(i, out.length - 1) : at
  var t = out[next]
  return {
    tabs: out, at: next, history: t.history.slice(), historyAt: t.at,
    open: i === at && t.at >= 0 && t.at < t.history.length ? t.history[t.at] : ""
  }
}

// Another tab, the one you were on kept: { tabs, at, history, historyAt,
// open }, or null when it's the one you're on.
function switched(tabs, at, history, historyAt, i) {
  if (i === at || i < 0 || i >= tabs.length) return null
  var out = stash(tabs, at, history, historyAt)
  var t = out[i]
  return {
    tabs: out, at: i, history: t.history.slice(), historyAt: t.at,
    open: t.at >= 0 && t.at < t.history.length ? t.history[t.at] : ""
  }
}

// A tab dragged from one place to another: { tabs, at }, at following the
// one you're on.
function moved(tabs, at, from, to) {
  if (from < 0 || from >= tabs.length || to < 0 || to >= tabs.length || from === to) return { tabs: tabs, at: at }
  var out = tabs.slice()
  var t = out.splice(from, 1)[0]
  out.splice(to, 0, t)
  var next = at === from ? to : from < at && to >= at ? at - 1 : from > at && to <= at ? at + 1 : at
  return { tabs: out, at: next }
}

// The tab that shows this (the first), else -1.
function find(tabs, at, history, historyAt, id) {
  return shown(tabs, at, history, historyAt).indexOf(id)
}

// A tab's name and icon, from what it shows: { title, icon }. `pages`: the
// index's pages (Workspace.js), `tagLabel(name)` a tag's name as shown.
function label(id, pages, tagLabel) {
  var s = String(id || "")
  if (!s) return { title: "New tab", icon: "" }
  if (s.indexOf("tag:") === 0) {
    var name = s.slice(4)
    return { title: tagLabel ? tagLabel(name) : "#" + name, icon: "" }
  }
  if (s.indexOf("calendar") === 0) return { title: "Calendar", icon: "" }
  if (s.indexOf("library") === 0) return { title: "Library", icon: "" }
  if (s.indexOf("people") === 0) return { title: "People", icon: "" }
  if (s === "tasks") return { title: "Tasks", icon: "" }
  if (s === "templates") return { title: "Templates", icon: "" }
  var e = pages ? pages[s] : null
  if (!e) return { title: "Not there any more", icon: "" }
  return { title: e.title || "Untitled", icon: e.icon || "" }
}

// How a click with these keys held opens a page (DocView.openFromLink): ""
// where you are, "tab" with Ctrl, "split" with Ctrl+Shift. (Qt's modifier
// bits: Shift 0x02000000, Ctrl 0x04000000.)
function openHow(modifiers) {
  var m = Number(modifiers) || 0
  if (!(m & 0x04000000)) return ""
  return m & 0x02000000 ? "split" : "tab"
}
