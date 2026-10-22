// PageSort.js - (fork) the order the sidebar shows the pages inside a page
// in: as they are on it (the default, what dragging changes), by name, by
// when they were last changed, or by when they were made, each either way
// round. Chosen from a
// page's ⋯ menu in the sidebar, kept on its entry in index.json (`sort`),
// so it's the same wherever the notebook is open. Only what's shown: the
// page's own blocks stay where they are.
//
// Shared with tests/pagesort.test.cjs, so keep it plain JavaScript with no
// QML or Node APIs.
.pragma library

// Each way, as kept, with its name in the menu.
var MODES = [
  { id: "", title: "As on the page" },
  { id: "title", title: "Name A\u2013Z" },
  { id: "titleDesc", title: "Name Z\u2013A" },
  { id: "modified", title: "Last changed first" },
  { id: "modifiedOld", title: "Last changed last" },
  { id: "created", title: "Newest first" },
  { id: "createdOld", title: "Oldest first" }
]

// A way as it may be kept: one of MODES' ids, else "" (as on the page).
function clean(mode) {
  for (var i = 1; i < MODES.length; i++) if (MODES[i].id === mode) return mode
  return ""
}

// The ids in that order (`pages`: the index's). Two alike keep the order
// they're in on the page.
function sorted(ids, pages, mode) {
  var m = clean(mode)
  if (!m || !ids || ids.length < 2) return ids
  var at = {}
  ids.forEach(function(id, i) { at[id] = i })
  function e(id) { return pages[id] || {} }
  function name(id) { return String(e(id).title || "").trim() }
  return ids.slice().sort(function(a, b) {
    var d = 0
    if (m === "title" || m === "titleDesc") {
      var x = name(a), y = name(b)
      // (Untitled ones last.)
      d = !x !== !y ? (x ? -1 : 1) : x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }) * (m === "titleDesc" && x && y ? -1 : 1)
    } else {
      var key = m === "modified" || m === "modifiedOld" ? "modified" : "created"
      var p = String(e(a)[key] || ""), q = String(e(b)[key] || "")
      d = p === q ? 0 : (p < q ? -1 : 1) * (m === "createdOld" || m === "modifiedOld" ? 1 : -1)
    }
    return d || at[a] - at[b]
  })
}

// A note's own list of blocks with its page blocks (the pages inside it, at
// the top level of the note, with nothing inside them) in that order, each
// in a place a page block was: the text between them stays where it is.
// The same list when the way is "as on the page" or they're in order.
function arrange(list, pages, mode) {
  var m = clean(mode)
  if (!m || !list) return list
  var slots = [], ids = []
  list.forEach(function(b, i) {
    if (b.type !== "page" || (b.indent || 0) !== 0 || !pages[b.uid]) return
    var next = list[i + 1]
    if (next && (next.indent || 0) > 0) return
    slots.push(i)
    ids.push(b.uid)
  })
  if (ids.length < 2) return list
  var order = sorted(ids, pages, m)
  if (order.join() === ids.join()) return list
  var byId = {}
  slots.forEach(function(i) { byId[list[i].uid] = list[i] })
  var out = list.slice()
  slots.forEach(function(i, n) { out[i] = byId[order[n]] })
  return out
}
