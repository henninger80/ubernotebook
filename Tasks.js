// Tasks.js - (fork) every open to-do on your pages, as a task: its date (the
// first date or reminder in its line, "@Fri 16 Oct"), its priority (#prio-hoch,
// #prio-high, #high, #wichtig, #dringend, #urgent; #prio-niedrig, #prio-low,
// #low) and whether it's being done (#in-arbeit, #doing, #in-progress).
//
// A page's index entry keeps its open to-dos (Workspace.qml, as the page is
// saved, and as it's first read after the start), so the Tasks view
// (app/TaskView.qml), the calendar and `tasks` from a terminal have them
// without reading every page:
//
//   tasks: [{ b: "<block id>", t: "Call the venue", d: "2026-10-16" (or
//            "2026-10-16T09:30"), p: 1 | -1, s: "doing", g: ["todo",
//            "kopfsprung"] (its tags) }], d, p, s and g left out when there's
//            none (clean() gives them all).
//
// and its ticked ones, for the Tasks view's Done and Cancelled:
//
//   done: [{ b, t, d, e: "2026-10-16" (when it was done: the date after
//           "erledigt" or "done" in its line), c: 1 (cancelled: #abgebrochen,
//           #canceled), g }], cleanDone() gives them.
//
// A task's status (statusOf): "todo", "doing" (#in-arbeit), "done" or
// "cancelled" (#abgebrochen, ticked or not).
//
// Shared with tests/tasks.test.cjs, so keep it plain JavaScript with no QML
// or Node APIs.
.pragma library
.import "Html.js" as Html
.import "Tags.js" as Tags
.import "Dates.js" as Dates

var HIGH = ["prio-hoch", "prio-high", "high", "wichtig", "dringend", "urgent"]
var LOW = ["prio-niedrig", "prio-low", "low"]
var DOING = ["in-arbeit", "doing", "in-progress"]
var CANCELLED = ["abgebrochen", "canceled", "cancelled"]
// The statuses the view filters by, and what they're called: "open" is
// every one not ticked.
var STATUSES = [
  { id: "open", label: "Open" },
  { id: "todo", label: "To do" },
  { id: "doing", label: "In progress" },
  { id: "done", label: "Done" },
  { id: "cancelled", label: "Cancelled" }
]
// (At most this many on a page, each this long.)
var MAX = 300
var TEXT = 120
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The buckets, in order, and what they're called.
var BUCKETS = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "week", label: "Next 7 days" },
  { id: "later", label: "Later" },
  { id: "none", label: "No date" }
]

var MARKS = /<a\s[^>]*href="(?:uber-notebook|omanote):\/\/(?:tag|date|remind)\/[^"]*"[^>]*>[\s\S]*?<\/a>/g

// A to-do's words without its tags and dates ("Call Sam #todo · fällig @Fri
// 16 Oct" -> "Call Sam").
function text(html) {
  var t = Html.plainText(String(html || "").replace(MARKS, " ")).replace(/\s+/g, " ").trim()
  for (var i = 0; i < 3; i++) t = t.replace(/(?:\s*[·,;:–-])*\s*(?:fällig|geplant|erledigt|due|bis|am|on|by)?\s*$/i, "").replace(/\s*[·,;:–-]+\s*$/, "").trim()
  return t.length > TEXT ? t.slice(0, TEXT - 1) + "…" : t
}

function one(list, names) {
  for (var i = 0; i < list.length; i++) if (names.indexOf(list[i]) >= 0) return true
  return false
}

// A to-do block -> a task, or null (ticked, or nothing written in it).
function ofBlock(b) {
  if (!b || b.type !== "check" || b.checked) return null
  var html = String(b.html || "")
  if (!Html.plainText(html).trim()) return null
  var d = ""
  var links = Html.links(html)
  for (var i = 0; i < links.length && !d; i++) {
    var at = Dates.fromHref(links[i].href)
    if (at) d = Dates.iso(at.at, at.time)
  }
  var g = Tags.inHtml(html).map(function(t) { return t.name }).slice(0, 12)
  // (What's empty left out, as the tree keeps it.)
  var out = { b: b.uid || b.id, t: text(html) }
  if (d) out.d = d
  var p = one(g, HIGH) ? 1 : one(g, LOW) ? -1 : 0
  if (p) out.p = p
  if (one(g, CANCELLED)) out.s = "cancelled"
  else if (one(g, DOING)) out.s = "doing"
  if (g.length) out.g = g
  return out
}

// A ticked to-do block -> a done task, or null (not ticked, or nothing
// written in it).
function doneOfBlock(b) {
  if (!b || b.type !== "check" || !b.checked) return null
  var html = String(b.html || "")
  if (!Html.plainText(html).trim()) return null
  var first = function(h) {
    var links = Html.links(h)
    for (var i = 0; i < links.length; i++) {
      var at = Dates.fromHref(links[i].href)
      if (at) return Dates.iso(at.at, false)
    }
    return ""
  }
  var g = Tags.inHtml(html).map(function(t) { return t.name }).slice(0, 12)
  var out = { b: b.uid || b.id, t: text(html) }
  var d = first(html)
  if (d) out.d = d
  var m = /(erledigt|done|completed|abgeschlossen)/i.exec(html)
  var e = m ? first(html.slice(m.index)) : ""
  if (e) out.e = e
  if (one(g, CANCELLED)) out.c = 1
  if (g.length) out.g = g
  return out
}

// A page's blocks -> its done tasks.
function doneOfBlocks(blocks) {
  var out = []
  ;(blocks || []).forEach(function(b) {
    if (out.length >= MAX) return
    var t = doneOfBlock(b)
    if (t) out.push(t)
  })
  return out
}

// What an index entry keeps of them, as it may be used.
function cleanDone(list) {
  return (Array.isArray(list) ? list : []).filter(function(x) { return x && UUID.test(x.b) }).slice(0, MAX).map(function(x) {
    var out = { b: x.b, t: String(x.t || "").slice(0, TEXT) }
    if (typeof x.d === "string" && Dates.fromIso(x.d)) out.d = x.d
    if (typeof x.e === "string" && Dates.fromIso(x.e)) out.e = x.e
    if (x.c === 1) out.c = 1
    var g = Array.isArray(x.g) ? x.g.filter(function(n) { return typeof n === "string" && Tags.clean(n) === n }).slice(0, 12) : []
    if (g.length) out.g = g
    return out
  })
}

// A task's status, as all() and closed() give it.
function statusOf(t) {
  if (t.done) return t.c ? "cancelled" : "done"
  return t.s === "cancelled" ? "cancelled" : t.s === "doing" ? "doing" : "todo"
}

// The open tasks with this status ("open": every one).
function withStatus(list, status) {
  if (!status || status === "open") return list
  return list.filter(function(t) { return statusOf(t) === status })
}

// Every ticked task, `tag` its tag if one's given: [{ page, title, icon, b,
// t, d, e, c, g, done: true, bucket: "closed" }], the last done first (by
// the day it was done, else the day it was for; those with neither last,
// the page changed last first).
function closed(index, tag) {
  var out = []
  for (var id in index.pages) {
    var e = index.pages[id]
    if (!e.done || !e.done.length || !live(index, id)) continue
    e.done.forEach(function(x) {
      var g = x.g || []
      if (tag && g.indexOf(tag) < 0) return
      out.push({ page: id, title: e.title || "Untitled", icon: e.icon || "", modified: e.modified || "", b: x.b, t: x.t || "", d: x.d || "", e: x.e || "", c: x.c || 0, p: 0, s: "", g: g, done: true, bucket: "closed" })
    })
  }
  out.sort(function(a, b) {
    var ka = a.e || a.d, kb = b.e || b.d
    if (!ka !== !kb) return ka ? -1 : 1
    if (ka !== kb) return ka < kb ? 1 : -1
    return a.modified < b.modified ? 1 : a.modified > b.modified ? -1 : 0
  })
  return out
}

// The tasks the view shows for a status: the open ones (all), or the
// ticked ones (closed), filtered.
function forStatus(index, now, tag, status) {
  if (status === "done" || status === "cancelled") {
    var c = withStatus(closed(index, tag), status)
    // (Cancelled but not ticked: there too.)
    return status === "cancelled" ? withStatus(all(index, now, tag), "cancelled").concat(c) : c
  }
  return withStatus(all(index, now, tag), status)
}

// A page's blocks (Workspace.flatten) -> its tasks.
function ofBlocks(blocks) {
  var out = []
  ;(blocks || []).forEach(function(b) {
    if (out.length >= MAX) return
    var t = ofBlock(b)
    if (t) out.push(t)
  })
  return out
}

// What an index entry keeps, as it may be used (what's empty left out, as
// ofBlock has it).
function clean(list) {
  return (Array.isArray(list) ? list : []).filter(function(x) { return x && UUID.test(x.b) }).slice(0, MAX).map(function(x) {
    var out = { b: x.b, t: String(x.t || "").slice(0, TEXT) }
    if (typeof x.d === "string" && Dates.fromIso(x.d)) out.d = x.d
    if (x.p === 1 || x.p === -1) out.p = x.p
    if (x.s === "doing" || x.s === "cancelled") out.s = x.s
    var g = Array.isArray(x.g) ? x.g.filter(function(n) { return typeof n === "string" && Tags.clean(n) === n }).slice(0, 12) : []
    if (g.length) out.g = g
    return out
  })
}

// Whether the page is one to look in: not in the trash, the archive or the templates.
function live(index, id) {
  var seen = {}
  var p = id
  while (p && index.pages[p] && !seen[p]) {
    var e = index.pages[p]
    if (e.trashed || e.archived || e.template || e.synced) return false
    seen[p] = true
    p = e.parent
  }
  return !!index.pages[id]
}

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

// The bucket a task's date is in, `now` being now.
function bucketOf(d, now) {
  if (!d) return "none"
  var x = Dates.fromIso(d)
  if (!x) return "none"
  var today = startOfDay(now)
  var day = startOfDay(x.at)
  if (day < today) return "overdue"
  if (day.getTime() === today.getTime()) return "today"
  if (day < new Date(today.getFullYear(), today.getMonth(), today.getDate() + 8)) return "week"
  return "later"
}

// Every open task, `tag` its tag if one's given ("" every one): [{ page,
// title, icon, b, t, d, p, s, g, bucket }], the dated by their date (the
// important first on a day), the rest the important first, then the page
// changed last.
function all(index, now, tag) {
  var n = now || new Date()
  var out = []
  for (var id in index.pages) {
    var e = index.pages[id]
    if (!e.tasks || !e.tasks.length || !live(index, id)) continue
    e.tasks.forEach(function(x) {
      var g = x.g || []
      if (tag && g.indexOf(tag) < 0) return
      out.push({ page: id, title: e.title || "Untitled", icon: e.icon || "", modified: e.modified || "", b: x.b, t: x.t || "", d: x.d || "", p: x.p || 0, s: x.s || "", g: g, bucket: bucketOf(x.d || "", n) })
    })
  }
  out.sort(function(a, b) {
    if (a.d && b.d && a.d.slice(0, 10) !== b.d.slice(0, 10)) return a.d < b.d ? -1 : 1
    if (a.d && !b.d) return -1
    if (!a.d && b.d) return 1
    if (a.p !== b.p) return b.p - a.p
    if ((a.s === "doing") !== (b.s === "doing")) return a.s === "doing" ? -1 : 1
    if (a.d !== b.d) return a.d < b.d ? -1 : 1
    return a.modified < b.modified ? 1 : a.modified > b.modified ? -1 : 0
  })
  return out
}

// How many tasks are open, and how many of them overdue: { open, late }
// (all's, without making or sorting them).
function count(index, now) {
  var today = startOfDay(now || new Date())
  var out = { open: 0, late: 0 }
  for (var id in index.pages) {
    var e = index.pages[id]
    if (!e.tasks || !e.tasks.length || !live(index, id)) continue
    out.open += e.tasks.length
    for (var i = 0; i < e.tasks.length; i++) {
      var d = e.tasks[i].d ? Dates.fromIso(e.tasks[i].d) : null
      if (d && startOfDay(d.at) < today) out.late++
    }
  }
  return out
}

// The tasks in their buckets: [{ id, label, tasks }], every bucket.
function buckets(list) {
  return BUCKETS.map(function(k) { return { id: k.id, label: k.label, tasks: list.filter(function(t) { return t.bucket === k.id }) } })
}

// The tags the tasks have most (not their priority's or being done's): [{ name, n }].
function topTags(list, max) {
  var count = {}
  list.forEach(function(t) { t.g.forEach(function(g) { if (HIGH.indexOf(g) < 0 && LOW.indexOf(g) < 0 && DOING.indexOf(g) < 0 && CANCELLED.indexOf(g) < 0) count[g] = (count[g] || 0) + 1 }) })
  return Object.keys(count).map(function(g) { return { name: g, n: count[g] } }).sort(function(a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1) }).slice(0, max || 8)
}

// The dated tasks from `from` up to `to` (Dates), for the calendar, as
// Workspace.datedNotes has its notes: { kind: "task", page, title, text, at, time }.
function inRange(index, from, to) {
  var out = []
  for (var id in index.pages) {
    var e = index.pages[id]
    if (!e.tasks || !e.tasks.length || !live(index, id)) continue
    e.tasks.forEach(function(x) {
      if (!x.d) return
      var d = Dates.fromIso(x.d)
      if (!d || d.at < from || d.at >= to) return
      out.push({ kind: "task", page: id, block: x.b, title: x.t || "To-do", text: "", at: d.at, time: d.time })
    })
  }
  return out
}

// How a task's date is said: "Today", "Tomorrow", "Fri 16 Oct", "3 days late".
function when(d, now) {
  if (!d) return ""
  var x = Dates.fromIso(d)
  if (!x) return ""
  var n = now || new Date()
  var days = Math.round((startOfDay(x.at) - startOfDay(n)) / 86400000)
  var time = x.time ? " " + Dates.clockOf(x.at) : ""
  if (days === 0) return "Today" + time
  if (days === 1) return "Tomorrow" + time
  if (days === -1) return "Yesterday" + time
  if (days < 0 && days > -60) return -days + " days late"
  return Dates.label(x.at, x.time, n)
}
