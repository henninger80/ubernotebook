// Outside.js (fork) - the Pages folder changed by something else while Uber
// Notebook runs: a sync tool (Nextcloud, Syncthing...) bringing in what was
// written on another computer. Workspace.qml looks at the folder every few
// seconds (Workspace.qml: "[fork] Changes from outside"); what it finds is
// worked out here, so it can be tested without a disk.
//
//   - a page file the tree doesn't know: put in it (the Nextcloud client
//     often brings it a little after the shell has started);
//   - a page file changed: read again, the tree and what's shown with it;
//   - a page file gone: out of the tree (not one written here this session);
//   - index.json changed: merged with the tree here (mergeIndex), so what
//     only it keeps (trash, archive, favorites, order...) isn't written over.
.pragma library

// What `find -printf '%f\t%T@\t%s\n'` says: { "<name>.json": "<mtime> <size>" }.
function stamps(output) {
  var out = {}
  String(output || "").split("\n").forEach(function(line) {
    var p = line.split("\t")
    if (p.length !== 3 || !/\.json$/.test(p[0])) return
    out[p[0]] = p[1] + " " + p[2]
  })
  return out
}

// A short fingerprint of a file's text (FNV-1a, with its length): enough to
// tell a file as written here from one changed elsewhere.
function hash(text) {
  var s = String(text === undefined || text === null ? "" : text)
  var h = 2166136261
  for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return s.length + ":" + h.toString(16)
}

// What's different between two looks at the folder (stamps() each; `before`
// null: the first look, nothing changed yet), for the pages the tree knows
// (`known`: id -> true) and ids that are pages (isId):
//   { added: [ids], changed: [ids], gone: [ids], index: bool }
// `added` is every page file the tree doesn't know, first look or not.
function diff(before, now, known, isId) {
  var out = { added: [], changed: [], gone: [], index: false }
  for (var name in now) {
    if (name === "index.json") { if (before && before[name] !== now[name]) out.index = true; continue }
    var id = name.slice(0, -5)
    if (!isId(id)) continue
    if (!known[id]) out.added.push(id)
    else if (before && before[name] !== undefined && before[name] !== now[name]) out.changed.push(id)
    else if (before && before[name] === undefined) out.changed.push(id)
  }
  for (var k in known) if (now[k + ".json"] === undefined) out.gone.push(k)
  return out
}

// Gone pages taken out only when it looks like files went, not the folder
// (unmounted, emptied while a sync tool starts over): none of them when the
// folder's empty or more than a fifth of the pages would go at once.
function plausiblyGone(gone, total) {
  if (!gone.length) return []
  if (total <= 0 || gone.length > Math.max(3, Math.floor(total / 5))) return []
  return gone
}

// What index.json keeps of a page that its file doesn't.
var FIELDS = ["parent", "trashed", "archived", "template", "description", "synced", "childTemplate", "sort", "children"]

function norm(v) {
  if (v === undefined || v === null || v === false || v === "") return null
  if (Array.isArray(v) && v.length === 0) return null
  if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) return null
  return v
}
function same(a, b) { return JSON.stringify(norm(a)) === JSON.stringify(norm(b)) }

// Three index.json's (as JSON.parse gives them: { top, pages, favorites,
// tagColors, fired, ... }): `base` as it was last read or written here,
// `ours` the tree here now, `theirs` the one on disk now. What they changed
// since base and we didn't is taken; what we both changed stays ours (it's
// written next); reminders that came on either are kept as come. Pages are
// ours: one only theirs has is left to its file (it's put in the tree when
// it's here). Returns a new raw index (Workspace.cleanIndex it).
function mergeIndex(base, ours, theirs) {
  var b = base && typeof base === "object" ? base : {}
  var o = JSON.parse(JSON.stringify(ours || {}))
  var t = theirs && typeof theirs === "object" ? theirs : {}
  var bp = b.pages || {}
  var tp = t.pages || {}
  o.pages = o.pages || {}
  for (var id in o.pages) {
    var te = tp[id]
    if (!te) continue
    var be = bp[id] || {}
    var oe = o.pages[id]
    FIELDS.forEach(function(f) {
      if (!same(te[f], be[f]) && same(oe[f], be[f])) {
        if (norm(te[f]) === null) delete oe[f]
        else oe[f] = JSON.parse(JSON.stringify(te[f]))
      }
    })
  }
  ;["top", "favorites", "tagColors"].forEach(function(k) {
    if (!same(t[k], b[k]) && same(o[k], b[k])) o[k] = JSON.parse(JSON.stringify(t[k] || (k === "tagColors" ? {} : [])))
  })
  var fired = {}
  var of = o.fired || {}
  var tf = t.fired && typeof t.fired === "object" ? t.fired : {}
  for (var a in of) fired[a] = of[a]
  for (var c in tf) if (fired[c] === undefined) fired[c] = tf[c]
  o.fired = fired
  return o
}

// A new page's entry (from its file) with what index.json on disk says of
// it that its file doesn't (in the trash, archived...): `fromDisk` that
// page's entry there, or null.
function seed(entry, fromDisk) {
  if (!fromDisk) return entry
  FIELDS.forEach(function(f) {
    if (f === "children" || f === "parent") return
    if (norm(fromDisk[f]) !== null) entry[f] = JSON.parse(JSON.stringify(fromDisk[f]))
  })
  return entry
}

// The page called `title` (not in the trash: inTrash(index, id)), the most
// recently changed of them, or "". An event's notes made on another computer:
// which page they are is kept with the event on each computer (the synced
// calendars' cache), so the other one finds them by what they're called
// ("Standup · Mon 5 Oct") before it makes them again.
function pageTitled(index, title, inTrash) {
  var want = String(title || "").trim()
  if (!want || !index || !index.pages) return ""
  var best = "", at = ""
  for (var id in index.pages) {
    var e = index.pages[id]
    if (!e || String(e.title || "").trim() !== want) continue
    if (inTrash && inTrash(index, id)) continue
    var m = String(e.modified || "")
    if (!best || m > at) { best = id; at = m }
  }
  return best
}
