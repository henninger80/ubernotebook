// Mentions.js - (fork) the pages that name a page without linking to it
// (Obsidian's and Roam's unlinked mentions): its title in their text, as
// a whole word or words, accents and umlauts aside (Search.fold), not in
// their title, on pages that don't link to it already. Shown under the
// page's "Linked from" (app/MentionsBar.qml); a click links the first
// place on that page (link()), and "Link all" does it on each.
//
// Shared with tests/mentions.test.cjs, so keep it plain JavaScript with no
// QML or Node APIs.
.pragma library
.import "Workspace.js" as Workspace
.import "Search.js" as Search
.import "Blocks.js" as Blocks

// A title shorter than this, or only digits and dots, names too much.
var MIN = 3
var WORD = /[0-9a-zÀ-￿]/

function usable(title) {
  var t = String(title || "").trim()
  return t.length >= MIN && t !== "Untitled" && !/^[\d\s.,:\/-]+$/.test(t)
}

// Where the folded `needle` is in the folded `hay`, from `from`, as a whole
// word (nothing but a space or a sign either side): its place, or -1.
function wordAt(hay, needle, from) {
  var at = hay.indexOf(needle, from)
  while (at >= 0) {
    var before = at > 0 ? hay.charAt(at - 1) : " "
    var after = at + needle.length < hay.length ? hay.charAt(at + needle.length) : " "
    if (!WORD.test(before) && !WORD.test(after)) return at
    at = hay.indexOf(needle, at + 1)
  }
  return -1
}

// The pages that name page `id` without a link to it, the last changed
// first: [{ id, at, length, count }], `at` the first place in its text
// (Workspace.qml's texts, its title first), `count` how many places.
function find(index, texts, id, limit) {
  var e = index.pages[id]
  if (!e || !usable(e.title)) return []
  var needle = Search.fold(String(e.title).trim())
  var out = []
  for (var pid in index.pages) {
    if (pid === id || texts[pid] === undefined) continue
    var o = index.pages[pid]
    if (o.synced || (o.links && o.links.indexOf(id) >= 0)) continue
    var en = Search.entry(pid, texts[pid], o.title || "")
    var at = wordAt(en.fold, needle, en.title)
    if (at < 0) continue
    if (Workspace.inTrash(index, pid) || Workspace.inTemplates(index, pid)) continue
    var n = 0
    for (var x = at; x >= 0 && n < 99; x = wordAt(en.fold, needle, x + needle.length)) n++
    out.push({ id: pid, at: at, length: needle.length, count: n })
  }
  out.sort(function(a, b) { return String(index.pages[a.id].modified || "") < String(index.pages[b.id].modified || "") ? 1 : -1 })
  return out.slice(0, limit || 100)
}

// The first place a block's words name `title` (not inside a link already)
// made a link to page `id`: the block's new text, or "" if it doesn't name it.
function linkIn(inner, title, id) {
  var needle = Search.fold(String(title || "").trim())
  if (!needle) return ""
  var parts = String(inner || "").split(/(<[^>]*>)/)
  var inLink = 0
  for (var i = 0; i < parts.length; i++) {
    var s = parts[i]
    if (s.charAt(0) === "<") {
      if (/^<a[\s>]/i.test(s)) inLink++
      else if (/^<\/a\s*>/i.test(s)) inLink = Math.max(0, inLink - 1)
      continue
    }
    if (inLink || !s) continue
    var at = wordAt(Search.fold(s), needle, 0)
    if (at < 0) continue
    parts[i] = s.slice(0, at) + "<a href=\"uber-notebook://page/" + id + "\">" + s.slice(at, at + needle.length) + "</a>" + s.slice(at + needle.length)
    return parts.join("")
  }
  return ""
}

// The first place on a page naming page `id` (titled `title`) linked:
// changes the page, and returns whether it did.
function linkOnPage(page, title, id) {
  var flat = Workspace.flatten(page)
  for (var i = 0; i < flat.length; i++) {
    var b = flat[i]
    if (!Blocks.isText(b.type) || b.type === "code" || !b.html) continue
    var next = linkIn(b.html, title, id)
    if (!next) continue
    page.blocks[b.uid].html = next
    return true
  }
  return false
}
