// Query.js - (fork) a query block on a page in Pages: the pages a search
// finds, kept on the page and found again as your notes change, as a list
// or as a table (a database view, as Notion's: the pages inside a page, with
// their status, due date, tags and when they changed).
//
// Its data (Blocks.cleanData):
//
//   { q: "Protokoll #vorstand status:active changed:30d",
//     scope: "all" (every page) | "here" (the pages inside the page it's on)
//            | "<uuid>" (the pages inside that one),
//     deep: false (only the pages right inside) | true (and theirs),
//     view: "list" | "table", sort: "auto" | "order" | "title" | "modified"
//     | "created" | "due" | "status", desc, limit (5 to 200),
//     cols: ["status", "due", "tags", "progress", "modified", "created", "path"],
//     title: "" (a heading over it), color, background }
//
// What the query can say, besides words (found as Ctrl+P finds them,
// Search.js):
//
//   #tag  -#tag            with the tag, without it
//   status:active          a project's status (planning, active, paused,
//                          done; open: any but done; German too)
//   is:project  is:favorite  is:task (open to-dos on it)  is:archived
//   -is:project ...        not
//   changed:7d  created:2w a day (d), a week (w), a month (m) or a year (y)
//                          back from now
//   due:7d  due:overdue    a project due within that, or late
//   in:Name  in:"A name"   inside the page with that title
//
// Shared with tests/query.test.cjs, so keep it plain JavaScript with no QML
// or Node APIs.
.pragma library
.import "Workspace.js" as Workspace
.import "Search.js" as Search
.import "Tags.js" as Tags
.import "Dates.js" as Dates
.import "QueryData.js" as QueryData
.import "Lang.js" as Lang

var COLUMNS = QueryData.COLUMNS
function clean(raw) { return QueryData.clean(raw) }
function toFence(data) { return QueryData.toFence(data) }
function fromFence(text) { return QueryData.fromFence(text) }

// A project's status as you may write it (English or German).
var STATUS_WORDS = {
  planning: "planning", plan: "planning", planung: "planning", geplant: "planning",
  active: "active", aktiv: "active", laufend: "active",
  paused: "paused", pause: "paused", pausiert: "paused",
  done: "done", fertig: "done", erledigt: "done", abgeschlossen: "done",
  open: "open", offen: "open"
}
var IS_WORDS = { project: "project", projekt: "project", favorite: "favorite", favorit: "favorite", task: "task", aufgabe: "task", archived: "archived", archiviert: "archived" }

// The query's parts: words in quotes kept together ("in:"A name"").
function tokens(q) {
  var out = []
  var re = /(-?[a-z]+:"[^"]*"|-?"[^"]*"|\S+)/gi
  var m
  while ((m = re.exec(String(q || ""))) !== null) out.push(m[1])
  return out
}

function unquote(s) { return s.replace(/^"|"$/g, "") }

// How long back (or ahead) "7d", "2w", "3m", "1y" is, in ms; -1 if it isn't one.
function span(s) {
  var m = /^(\d{1,4})([dwmy])$/i.exec(String(s || ""))
  if (!m) return -1
  var n = Number(m[1])
  var day = 86400000
  var unit = { d: day, w: 7 * day, m: 30 * day, y: 365 * day }[m[2].toLowerCase()]
  return n * unit
}

// What a query says: { words, tags, notTags, status, is, notIs, changed,
// created, due ("" | "overdue" | ms ahead), within (a page's title), bad
// (the parts not understood) }.
function parse(q) {
  var p = { words: [], tags: [], notTags: [], status: "", is: [], notIs: [], changed: -1, created: -1, due: "", within: "", bad: [] }
  tokens(q).forEach(function(t) {
    var neg = t.charAt(0) === "-" && t.length > 1
    var s = neg ? t.slice(1) : t
    if (s.charAt(0) === "#") {
      var tag = Tags.clean(s)
      if (tag) (neg ? p.notTags : p.tags).push(tag)
      else p.bad.push(t)
      return
    }
    var m = /^([a-z]+):(.*)$/i.exec(s)
    if (m && ["status", "is", "changed", "created", "due", "in"].indexOf(m[1].toLowerCase()) >= 0) {
      var key = m[1].toLowerCase()
      var v = unquote(m[2]).trim()
      var lv = v.toLowerCase()
      if (key === "status" && STATUS_WORDS[lv] && !neg) p.status = STATUS_WORDS[lv]
      else if (key === "is" && IS_WORDS[lv]) (neg ? p.notIs : p.is).push(IS_WORDS[lv])
      else if ((key === "changed" || key === "created") && span(lv) >= 0 && !neg) p[key] = span(lv)
      else if (key === "due" && !neg && (lv === "overdue" || lv === "late" || lv === "überfällig" || span(lv) >= 0)) p.due = span(lv) >= 0 ? span(lv) : "overdue"
      else if (key === "in" && v && !neg) p.within = v
      else p.bad.push(t)
      return
    }
    p.words.push(neg ? t : unquote(s))
  })
  return p
}

// The pages it may show: inside `root` (only right inside, or deeper),
// else every page; never the trash's, a template's, a synced block's, or
// the page it's on.
function candidates(index, root, deep, here) {
  var out = []
  if (root) {
    if (!index.pages[root]) return []
    if (deep) out = Workspace.withDescendants(index, root).slice(1)
    else out = index.pages[root].children.slice()
  } else {
    for (var id in index.pages) out.push(id)
  }
  return out.filter(function(id) {
    var e = index.pages[id]
    return e && id !== here && !e.synced && !Workspace.inTrash(index, id) && !Workspace.inTemplates(index, id)
  })
}

function hasTag(e, name) { return !!e.tags && e.tags.some(function(t) { return t.name === name }) }

function dueDays(e, now) {
  if (!e.project || !e.project.due) return null
  var d = Dates.fromIso(e.project.due)
  if (!d) return null
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((new Date(d.at.getFullYear(), d.at.getMonth(), d.at.getDate()).getTime() - today.getTime()) / 86400000)
}

// The pages a query block shows: { rows: [{ id, score, at, length }], total,
// bad, scope (the page it looks inside, "" for all) }. `here` is the page
// it's on; `texts` the pages' text (Workspace.qml's); `now` a Date.
function run(index, texts, data, here, now) {
  var d = clean(data)
  var p = parse(d.q)
  var n = now || new Date()
  var root = d.scope === "here" ? (here || "") : d.scope === "all" ? "" : d.scope
  var deep = d.deep
  if (p.within) {
    var named = Workspace.pageNamed(index, p.within)
    if (!named) return { rows: [], total: 0, bad: p.bad.concat(["in:" + p.within]), scope: root }
    // (Inside the page named, and inside the scope too when there's one.)
    if (root && named !== root && !Workspace.isInside(index.pages, named, root)) return { rows: [], total: 0, bad: p.bad, scope: root }
    root = named
    deep = true
  }
  if (d.scope === "here" && !here) return { rows: [], total: 0, bad: p.bad, scope: "" }
  var ids = candidates(index, root, deep, here)
  var hits = null
  if (p.words.length) {
    hits = {}
    Search.find(index, texts, p.words.join(" "), 100000).forEach(function(h) { hits[h.id] = h })
  }
  var favorites = index.favorites || []
  var rows = []
  var order = {}
  ids.forEach(function(id, i) {
    order[id] = i
    var e = index.pages[id]
    if (hits && !hits[id]) return
    if (p.is.indexOf("archived") < 0 && !(root && Workspace.inArchive(index, root)) && Workspace.inArchive(index, id)) return
    for (var a = 0; a < p.tags.length; a++) if (!hasTag(e, p.tags[a])) return
    for (var b = 0; b < p.notTags.length; b++) if (hasTag(e, p.notTags[b])) return
    if (p.status) {
      if (!e.project) return
      if (p.status === "open" ? e.project.status === "done" : e.project.status !== p.status) return
    }
    function is(what) {
      if (what === "project") return !!e.project
      if (what === "favorite") return favorites.indexOf(id) >= 0
      if (what === "task") return !!e.tasks && e.tasks.length > 0
      if (what === "archived") return Workspace.inArchive(index, id)
      return false
    }
    for (var c = 0; c < p.is.length; c++) if (!is(p.is[c])) return
    for (var k = 0; k < p.notIs.length; k++) if (is(p.notIs[k])) return
    if (p.changed >= 0 && n.getTime() - Date.parse(e.modified || 0) > p.changed) return
    if (p.created >= 0 && n.getTime() - Date.parse(e.created || 0) > p.created) return
    if (p.due !== "") {
      var dd = dueDays(e, n)
      if (dd === null || e.project.status === "done") return
      if (p.due === "overdue" ? dd >= 0 : dd * 86400000 > p.due) return
    }
    var h = hits ? hits[id] : null
    rows.push({ id: id, score: h ? h.score : 0, at: h ? h.at : -1, length: h ? h.length : 0 })
  })
  sortRows(index, rows, d, hits !== null, root !== "", order, n)
  return { rows: rows.slice(0, d.limit), total: rows.length, bad: p.bad, scope: root }
}

var STATUS_ORDER = { planning: 1, active: 0, paused: 2, done: 3 }

function sortRows(index, rows, d, words, inside, order, now) {
  var by = d.sort
  // "auto": the best found first for words, the page's own order inside a
  // page, else the last changed first.
  if (by === "auto") by = words ? "score" : inside ? "order" : "modified"
  function title(id) { return String(index.pages[id].title || "") }
  function cmp(a, b) {
    var ea = index.pages[a.id], eb = index.pages[b.id]
    if (by === "score") return b.score - a.score
    if (by === "order") return order[a.id] - order[b.id]
    if (by === "title") return title(a.id).localeCompare(title(b.id))
    if (by === "modified") return String(eb.modified || "") < String(ea.modified || "") ? -1 : String(eb.modified || "") > String(ea.modified || "") ? 1 : 0
    if (by === "created") return String(eb.created || "") < String(ea.created || "") ? -1 : String(eb.created || "") > String(ea.created || "") ? 1 : 0
    if (by === "due") {
      var da = dueDays(ea, now), db = dueDays(eb, now)
      if (da === null && db === null) return 0
      if (da === null) return 1
      if (db === null) return -1
      return da - db
    }
    if (by === "status") {
      var sa = ea.project ? STATUS_ORDER[ea.project.status] : 9, sb = eb.project ? STATUS_ORDER[eb.project.status] : 9
      return sa - sb
    }
    return 0
  }
  rows.sort(function(a, b) {
    var c = cmp(a, b)
    if (d.desc) c = -c
    return c || title(a.id).localeCompare(title(b.id))
  })
}

// A column's text for a page (the table's cells): "Active", "Fri 16 Oct",
// "#a #b", "3/5", "2 days ago" (in German, in a German app: Lang.js).
function cell(index, id, col, now) {
  var e = index.pages[id]
  if (!e) return ""
  var n = now || new Date()
  if (col === "status") return e.project ? Lang.t(Workspace.statusOf(e.project.status).label) : ""
  if (col === "due") {
    var info = e.project && e.project.due ? Workspace.dueInfo(e.project.due, n) : null
    if (!info) return ""
    var late = /^(\d+) days late$/.exec(info.label)
    return late ? late[1] + Lang.t(" days late") : Lang.t(info.label)
  }
  if (col === "tags") return (e.tags || []).slice(0, 6).map(function(t) { return t.label || "#" + t.name }).join(" ")
  if (col === "progress") { var pr = Workspace.projectProgress(index, id); return pr.total ? pr.done + "/" + pr.total : "" }
  if (col === "modified" || col === "created") return ago(e[col], n)
  if (col === "path") return Workspace.path(index, id).slice(0, -1).map(function(x) { return x.title || Lang.t("Untitled") }).join(" / ")
  return ""
}

// When, in a word: "Just now", "5 min ago", "Today", "Yesterday", "3 days
// ago", else its date.
function ago(iso, now) {
  var t = Date.parse(iso || "")
  if (!isFinite(t)) return ""
  var n = now || new Date()
  var mins = Math.round((n.getTime() - t) / 60000)
  if (mins < 1) return Lang.t("Just now")
  if (mins < 60) return mins + Lang.t(" min ago")
  var d = new Date(t)
  var today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  var days = Math.round((today - day) / 86400000)
  if (days === 0) return Lang.t("Today")
  if (days === 1) return Lang.t("Yesterday")
  if (days < 7) return days + Lang.t(" days ago")
  return Dates.label(d, false, n)
}

