// Daily.js - (fork) a page for each day, as Obsidian's daily notes: Ctrl+Shift+T
// (DocView.openDaily) opens today's, the calendar shows each day's and opens
// it, `daily` from a terminal (Api.qml) gives its id. Made the first time
// it's wanted, from a template of yours.
//
// Where they are: inside the page called `dailyParent` at the top of Pages
// (made if there's none), in a page for each year ("2026") when
// `dailyByYear`. A page there is a day's when its title has a date in it:
// "2026-10-16", "Fri 16 Oct 2026", "Fri 16 Oct" (the year its weekday says,
// nearest now) or "16.10.2026". New ones go first when the newest is first
// there, else last.
//
// The template: `dailyTemplate` (a template's name or id), else one of yours
// with {{date}} in its title and "daily", "tages" or "journal" in it, else a
// blank page called "Daily note, {{date}}". In the title {{date}} is written
// with its year, "Sun 18 Oct 2026", so a day's title is that day's only.
//
// The settings: Defaults.js (dailyParent, dailyTemplate, dailyByYear).
// Shared with tests/daily.test.cjs, so keep it plain JavaScript with no QML
// or Node APIs (fmt, the dates' names in words, comes from the caller).
.pragma library
.import "Workspace.js" as Workspace
.import "Templates.js" as Templates
.import "Dates.js" as Dates

var BLANK_TITLE = "Daily note, {{date}}"
// (How deep a day's page is looked for: in the page, or in its year's.)
var DEPTH = 2

var DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
var ISO = /(^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)/
var WORDS = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?,?\s+(\d{1,2})\.?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?(?!\d)/i
var DOTTED = /(^|[^\d.])(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/

function pad(n) { return (n < 10 ? "0" : "") + n }
function isoOf(y, m, d) {
  var at = new Date(y, m - 1, d)
  return at.getFullYear() === y && at.getMonth() === m - 1 && at.getDate() === d ? y + "-" + pad(m) + "-" + pad(d) : ""
}

// The day a title says ("2026-10-16"), or "". With no year, the one whose
// weekday it is nearest `now`.
function dateOfTitle(title, now) {
  var t = String(title || "")
  var m = ISO.exec(t)
  if (m) return isoOf(Number(m[2]), Number(m[3]), Number(m[4]))
  m = WORDS.exec(t)
  if (m) {
    var day = Number(m[2]), month = MONTHS.indexOf(m[3].toLowerCase()) + 1
    if (m[4]) return isoOf(Number(m[4]), month, day)
    var y0 = (now || new Date()).getFullYear()
    var wd = DAYS.indexOf(m[1].toLowerCase())
    for (var i = 0; i <= 12; i++) {
      var ys = i === 0 ? [y0] : [y0 - i, y0 + i]
      for (var j = 0; j < ys.length; j++) {
        var s = isoOf(ys[j], month, day)
        if (s && new Date(ys[j], month - 1, day).getDay() === wd) return s
      }
    }
    return ""
  }
  m = DOTTED.exec(t)
  if (m) return isoOf(Number(m[4]), Number(m[3]), Number(m[2]))
  return ""
}

function live(index, id) {
  return !!index.pages[id] && !Workspace.inTrash(index, id) && !Workspace.inArchive(index, id) && !Workspace.inTemplates(index, id)
}

// The page called `name` at the top of Pages, or "".
function parentPage(index, name) {
  var n = String(name || "").trim().toLowerCase()
  if (!n) return ""
  var top = index.top || []
  for (var i = 0; i < top.length; i++) {
    var e = index.pages[top[i]]
    if (e && !e.trashed && (e.title || "").trim().toLowerCase() === n && live(index, top[i])) return top[i]
  }
  return ""
}

// The pages in it that are a day's: [{ id, day }], as deep as DEPTH.
function days(index, parent, now) {
  var out = []
  if (!parent || !index.pages[parent]) return out
  function walk(id, depth) {
    var kids = index.pages[id].children || []
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i]
      var e = index.pages[c]
      if (!e || e.trashed || e.archived || e.template) continue
      var d = dateOfTitle(e.title, now)
      if (d) out.push({ id: c, day: d, inYear: (index.pages[id].title || "").trim() === d.slice(0, 4) })
      else if (depth < DEPTH) walk(c, depth + 1)
    }
  }
  walk(parent, 1)
  return out
}

// A day's page ("2026-10-16") in the page called `name`: its id, or "".
// (Two for a day: the one in its year's page, then the one changed last.)
function find(index, name, day, now) {
  var parent = parentPage(index, name)
  var best = null
  days(index, parent, now).forEach(function(x) {
    if (x.day !== day) return
    if (!best || (x.inYear && !best.inYear) || (x.inYear === best.inYear && (index.pages[x.id].modified || "") > (index.pages[best.id].modified || ""))) best = x
  })
  return best ? best.id : ""
}

// The days' pages from `from` up to `to` (Dates), for the calendar, as
// Workspace.datedNotes has its notes: { kind: "daily", page, title, text, at, time }.
function inRange(index, name, from, to, now) {
  var out = []
  days(index, parentPage(index, name), now).forEach(function(x) {
    var d = Dates.fromIso(x.day)
    if (!d || d.at < from || d.at >= to) return
    out.push({ kind: "daily", page: x.id, title: shortTitle(index.pages[x.id].title), text: "", at: d.at, time: false })
  })
  return out
}

// A day's page's title without its date ("Tagesnotiz, Fri 16 Oct 2026" ->
// "Tagesnotiz"), as the calendar shows it on that day.
function shortTitle(title) {
  var t = String(title || "").replace(ISO, "$1").replace(WORDS, "").replace(DOTTED, "$1")
  t = t.replace(/[\s,·:–-]+$/, "").replace(/^[\s,·:–-]+/, "").trim()
  return t || "Daily note"
}

// What the calendar says for one of its notes (a reminder's, a project's
// due date, or a day's page) in the "month", "week" or "agenda", as
// CalendarView said it before there were days' pages.
function noteLabel(n, view) {
  if (n.kind === "daily") return "\u{1f4d3} " + n.title
  if (n.kind === "task") return "\u2610 " + n.title
  if (view === "week") return "\u23f0 " + n.title
  var mark = n.kind === "due" ? "\u2691 " : "\u23f0 "
  if (view === "agenda") return mark + n.title + (n.text && n.kind !== "due" ? ": " + n.text : "")
  return mark + n.title + (n.text && n.kind !== "due" ? ": " + n.text : " due")
}

// The template a day's page starts from: its id, or "" for a blank page.
function template(index, name) {
  var named = Workspace.templateNamed(index, name)
  if (named) return named
  var list = Workspace.templates(index).filter(function(t) { return /\{\{\s*date\s*\}\}/i.test(t.title) && /daily|tages|journal/i.test(t.title) })
  return list.length ? list[0].id : ""
}

// A title filled in for `at` (a Date): {{date}} with its year, the rest as
// Templates.fill does. fmt(isoDay, pattern) writes a date in words.
function titleFor(title, at, fmt) {
  var long = Dates.SHORT_DAYS[at.getDay()] + " " + at.getDate() + " " + Dates.SHORT_MONTHS[at.getMonth()] + " " + at.getFullYear()
  return Templates.fill(String(title || "").replace(/\{\{\s*date\s*\}\}/gi, long), false, at, fmt)
}

// Whether the newest is first among these pages (by their day, or a year's
// number), as most of them are, one after the next: where a new one goes.
function newestFirst(index, ids, now) {
  var keys = []
  ids.forEach(function(id) {
    var e = index.pages[id]
    if (!e || e.trashed) return
    var t = (e.title || "").trim()
    var k = /^\d{4}$/.test(t) ? t + "-99" : dateOfTitle(t, now)
    if (k) keys.push(k)
  })
  var down = 0, up = 0
  for (var i = 1; i < keys.length; i++) {
    if (keys[i] < keys[i - 1]) down++
    else if (keys[i] > keys[i - 1]) up++
  }
  return down >= up
}

// The pages there, and where a new one goes: { at, before, after } for
// Workspace.qml's placePage.
function placeAmong(index, parent, id, now) {
  var kids = (index.pages[parent].children || []).filter(function(c) { return c !== id && index.pages[c] && !index.pages[c].trashed })
  if (!kids.length) return { parent: parent, at: -1, before: "", after: "" }
  if (newestFirst(index, kids, now)) return { parent: parent, at: 0, before: kids[0], after: "" }
  return { parent: parent, at: -1, before: "", after: kids[kids.length - 1] }
}

// A page made in `parent`, placed among the pages there; `make(parent)`
// makes it (its id, or ""). Its id.
function makeIn(ws, parent, make, now, done) {
  var id = make(parent)
  if (!id) { if (done) done(""); return "" }
  if (parent) ws.placePage(id, placeAmong(ws.index, parent, id, now), function() { if (done) done(id) })
  else if (done) done(id)
  return id
}

// The day's page ("2026-10-16", "" today): its id, made now if there's none
// (and its parent and year's page). `s`: the settings; fmt as titleFor's.
// done(id) once it's in its place ("" if it couldn't be made).
function open(ws, s, day, fmt, now, done) {
  var n = now || new Date()
  var d = Dates.fromIso(day || "") || { at: new Date(n.getFullYear(), n.getMonth(), n.getDate()) }
  var iso = Dates.iso(d.at)
  var name = String(s.dailyParent || "").trim() || "Daily notes"
  var ix = ws.index
  var found = find(ix, name, iso, n)
  if (found) { if (done) done(found); return found }
  var parent = parentPage(ix, name)
  if (!parent) {
    var p = ws.createPage({ parent: "", title: name })
    if (!p) { if (done) done(""); return "" }
    parent = p.id
  }
  var into = parent
  if (s.dailyByYear !== false) {
    var year = String(d.at.getFullYear())
    var kids = ix.pages[parent].children || []
    into = ""
    for (var i = 0; i < kids.length; i++) if (live(ix, kids[i]) && (ix.pages[kids[i]].title || "").trim() === year) { into = kids[i]; break }
    if (!into) into = makeIn(ws, parent, function(par) { var y = ws.createPage({ parent: par, title: year }); return y ? y.id : "" }, n)
    if (!into) { if (done) done(""); return "" }
  }
  // (The day's time now: {{time}} is when it's made.)
  var at = new Date(d.at.getFullYear(), d.at.getMonth(), d.at.getDate(), n.getHours(), n.getMinutes())
  var tpl = template(ix, s.dailyTemplate)
  return makeIn(ws, into, function(par) {
    if (!tpl) { var b = ws.createPage({ parent: par, title: titleFor(BLANK_TITLE, at, fmt) }); return b ? b.id : "" }
    return ws.pageFromTemplateNow(tpl, par, titleFor(ix.pages[tpl].title, at, fmt), function(text, html) { return Templates.fill(text, html, at, fmt) })
  }, n, done)
}
