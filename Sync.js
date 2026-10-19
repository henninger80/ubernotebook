// Sync.js (fork) - the calendar kept the same as calendars elsewhere: Office
// 365's (Microsoft Graph) and Google's, both ways. What each side's events
// are, made comparable; what's changed since the last sync and which way it
// goes; and the small things signing in needs (PKCE's SHA-256, forms).
// Sync.qml asks the services and makes the changes this plans.
//
// A calendar elsewhere is known by its key, "<provider>:<its id>"
// ("o365:AAMk...", "google:primary"). A link ties one of our events to one
// event there:
//
//   { nb: "<our event's id>", cal: "<calendar key>", rid: "<its id there>",
//     fp: "<both sides as they were, the last sync>", title, start, recurring }
//
// An event made here goes to the calendar it's given (Sync.qml keeps that,
// beside the calendar) or to the default one; "local" keeps it here. An
// event from one calendar elsewhere never goes to another.
//
// Shared with tests/sync.test.cjs, so keep it plain JavaScript with no QML
// or Node APIs.
.pragma library

var PAST_DAYS = 30
var FUTURE_DAYS = 365
var LOCAL = "local"
var MAX_NEW = 40 // [fork] most events one sync may make on one side, for a calendar with links
var REPEATS = ["daily", "weekdays", "weekly", "monthly", "yearly"]

function pad(n) { return (n < 10 ? "0" : "") + n }
function dayIso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) }
function addDaysIso(iso, n) {
  var p = String(iso).slice(0, 10).split("-").map(Number)
  return dayIso(new Date(p[0], p[1] - 1, p[2] + n))
}
function trim(s) { return String(s === undefined || s === null ? "" : s).trim() }

// The days the sync looks at: [from, to] ("2026-09-17", "2027-10-17").
function span(now) {
  var d = now || new Date()
  var today = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return [dayIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - PAST_DAYS)),
          dayIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + FUTURE_DAYS))]
}

// ---- events, made comparable ----------------------------------------------------------------
//
// { title, start, end, allDay, place }: start and end as our calendar keeps
// them ("2026-10-05T09:30", or a day; an all-day event's end is its last day).

function norm(ev) {
  return { title: trim(ev.title), start: String(ev.start), end: String(ev.end), allDay: ev.allDay === true, place: trim(ev.place) }
}

// A repeat as both sides can say it: { freq, every, until }, or null.
function repeatOf(r) {
  if (!r || REPEATS.indexOf(r.freq) < 0) return null
  return { freq: r.freq, every: Math.max(1, Math.round(Number(r.every) || 1)), until: r.until ? String(r.until).slice(0, 10) : "" }
}

// What's compared: the event, and its repeat.
function fp(n, repeat) {
  var r = repeatOf(repeat)
  return JSON.stringify([n.title, n.start, n.end, n.allDay, n.place, r ? [r.freq, r.every, r.until] : null])
}

// ---- Office 365 (Microsoft Graph) -------------------------------------------------------------
//
// Asked for its times in the computer's own zone (Prefer: outlook.timezone),
// so "2026-10-05T09:30:00.0000000" is read as it is.

function graphNorm(g) {
  var s = String(g.start.dateTime).slice(0, 19), e = String(g.end.dateTime).slice(0, 19)
  var place = trim((g.location || {}).displayName)
  if (g.isAllDay) {
    var sd = s.slice(0, 10), ed = addDaysIso(e, -1)
    if (ed < sd) ed = sd
    return { title: trim(g.subject), start: sd, end: ed, allDay: true, place: place }
  }
  return { title: trim(g.subject), start: s.slice(0, 16), end: e.slice(0, 16), allDay: false, place: place }
}

function graphBody(n, tz) {
  var st, en
  if (n.allDay) { st = n.start.slice(0, 10) + "T00:00:00"; en = addDaysIso(n.end, 1) + "T00:00:00" }
  else { st = n.start + ":00"; en = n.end + ":00" }
  return { subject: n.title, isAllDay: n.allDay, start: { dateTime: st, timeZone: tz }, end: { dateTime: en, timeZone: tz },
           location: { displayName: n.place } }
}

// A series' repeat, as our calendar can say it: { freq, every, until },
// null (it doesn't repeat), or "complex" (every second Tuesday...: its
// times come as events of their own).
function graphRepeat(g) {
  var rec = g.recurrence
  if (!rec || !rec.pattern) return null
  var p = rec.pattern, r = rec.range || {}
  var every = Math.max(1, Number(p.interval) || 1)
  if (r.type === "numbered") return "complex"
  var until = r.type === "endDate" && r.endDate ? String(r.endDate).slice(0, 10) : ""
  var days = (p.daysOfWeek || []).map(function(d) { return String(d).toLowerCase() }).sort()
  if (p.type === "daily") return { freq: "daily", every: every, until: until }
  if (p.type === "weekly") {
    if (days.join() === "friday,monday,thursday,tuesday,wednesday") return every === 1 ? { freq: "weekdays", every: 1, until: until } : "complex"
    return days.length <= 1 ? { freq: "weekly", every: every, until: until } : "complex"
  }
  if (p.type === "absoluteMonthly") return { freq: "monthly", every: every, until: until }
  if (p.type === "absoluteYearly") return { freq: "yearly", every: 1, until: until }
  return "complex"
}

function graphActive(g, today) {
  var r = (g.recurrence || {}).range || {}
  return r.type !== "endDate" || !r.endDate || String(r.endDate) >= today
}

// Graph's events (one calendar's), as the sync sees them: { rid: remote },
// and the series to ask for each time of (complex).
// remote: { rid, n, repeat, modified (ms) }.
function graphEvents(items, now) {
  var w = span(now), today = dayIso(now || new Date())
  var out = {}, complex = []
  ;(items || []).forEach(function(g) {
    if (!g || g.isCancelled || g.type === "occurrence" || g.type === "exception") return
    var repeat = null
    if (g.type === "seriesMaster") {
      if (!graphActive(g, today)) return
      repeat = graphRepeat(g)
      if (repeat === "complex") { complex.push(g.id); return }
    } else if (String(g.end.dateTime).slice(0, 10) < w[0] || String(g.start.dateTime).slice(0, 10) > w[1]) return
    out[g.id] = { rid: g.id, n: graphNorm(g), repeat: repeat, modified: Date.parse(g.lastModifiedDateTime) || 0 }
  })
  return { events: out, complex: complex }
}

// The times of complex series (calendarView): single events.
function graphTimes(items, complex, into) {
  var keep = {}
  complex.forEach(function(id) { keep[id] = true })
  ;(items || []).forEach(function(g) {
    if (g && !g.isCancelled && keep[g.seriesMasterId]) into[g.id] = { rid: g.id, n: graphNorm(g), repeat: null, modified: Date.parse(g.lastModifiedDateTime) || 0 }
  })
  return into
}

// What a change sends: everything, or a series' title and place.
function graphPatch(n, recurring, tz) {
  return recurring ? { subject: n.title, location: { displayName: n.place } } : graphBody(n, tz)
}

// ---- Google Calendar --------------------------------------------------------------------------
//
// Asked with timeZone=<the computer's>, so a time's first 16 characters are
// its time here; an all-day event's end is the day after its last.

function googleNorm(e) {
  var place = trim(e.location)
  if (e.start && e.start.date) {
    var sd = e.start.date, ed = addDaysIso(e.end && e.end.date ? e.end.date : addDaysIso(sd, 1), -1)
    if (ed < sd) ed = sd
    return { title: trim(e.summary), start: sd, end: ed, allDay: true, place: place }
  }
  return { title: trim(e.summary), start: String(e.start.dateTime).slice(0, 16), end: String(e.end.dateTime).slice(0, 16), allDay: false, place: place }
}

function googleBody(n, tz) {
  if (n.allDay) return { summary: n.title, location: n.place, start: { date: n.start.slice(0, 10) }, end: { date: addDaysIso(n.end, 1) } }
  return { summary: n.title, location: n.place, start: { dateTime: n.start + ":00", timeZone: tz }, end: { dateTime: n.end + ":00", timeZone: tz } }
}

function googlePatch(n, recurring, tz) {
  return recurring ? { summary: n.title, location: n.place } : googleBody(n, tz)
}

// An RRULE, as our calendar can say it (as graphRepeat).
function googleRepeat(e) {
  var rules = (e.recurrence || []).filter(function(l) { return /^RRULE:/i.test(l) })
  if (!rules.length) return null
  if (rules.length > 1) return "complex"
  var parts = {}
  rules[0].replace(/^RRULE:/i, "").split(";").forEach(function(kv) {
    var i = kv.indexOf("=")
    if (i > 0) parts[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1).toUpperCase()
  })
  if (parts.COUNT || parts.BYSETPOS) return "complex"
  var every = Math.max(1, Number(parts.INTERVAL) || 1)
  var until = parts.UNTIL ? parts.UNTIL.slice(0, 4) + "-" + parts.UNTIL.slice(4, 6) + "-" + parts.UNTIL.slice(6, 8) : ""
  var days = parts.BYDAY ? parts.BYDAY.split(",").sort() : []
  if (days.some(function(d) { return !/^(MO|TU|WE|TH|FR|SA|SU)$/.test(d) })) return "complex"
  if (parts.FREQ === "DAILY") return days.length ? "complex" : { freq: "daily", every: every, until: until }
  if (parts.FREQ === "WEEKLY") {
    if (days.join() === "FR,MO,TH,TU,WE") return every === 1 ? { freq: "weekdays", every: 1, until: until } : "complex"
    return days.length <= 1 ? { freq: "weekly", every: every, until: until } : "complex"
  }
  if (parts.FREQ === "MONTHLY") return days.length || (parts.BYMONTHDAY && parts.BYMONTHDAY.indexOf(",") >= 0) ? "complex" : { freq: "monthly", every: every, until: until }
  if (parts.FREQ === "YEARLY") return every === 1 && !days.length ? { freq: "yearly", every: 1, until: until } : "complex"
  return "complex"
}

// Google's events (one calendar's): { events: { rid: remote }, complex: [series ids] }.
function googleEvents(items, now) {
  var w = span(now), today = dayIso(now || new Date())
  var out = {}, complex = []
  ;(items || []).forEach(function(e) {
    if (!e || e.status === "cancelled" || e.recurringEventId || !e.start) return
    var repeat = googleRepeat(e)
    if (repeat === "complex") { complex.push(e.id); return }
    if (repeat && repeat.until && repeat.until < today) return
    if (!repeat) {
      var n = googleNorm(e)
      if (n.end.slice(0, 10) < w[0] || n.start.slice(0, 10) > w[1]) return
    }
    out[e.id] = { rid: e.id, n: googleNorm(e), repeat: repeat, modified: Date.parse(e.updated) || 0 }
  })
  return { events: out, complex: complex }
}

// A complex series' times (its instances): single events.
function googleTimes(items, into) {
  ;(items || []).forEach(function(e) {
    if (e && e.status !== "cancelled" && e.start) into[e.id] = { rid: e.id, n: googleNorm(e), repeat: null, modified: Date.parse(e.updated) || 0 }
  })
  return into
}

// ---- what changes, one calendar elsewhere at a time -----------------------------------------
//
// plan({ cal, remote: { rid: remote }, links: [this calendar's links],
//   local: [our events], linkedElsewhere: { nb: true }, assigned: { nb: key },
//   fallback: the default calendar's key (or "local"), last: the last sync
//   (ms), now: Date })
// -> { actions, links, deletions, refused }
//
// actions: { op: "localCreate", rid, n, repeat } | { op: "localUpdate", nb, n, repeat }
//   | { op: "localDelete", nb } | { op: "remoteCreate", nb, n }
//   | { op: "remoteUpdate", rid, n, recurring } | { op: "remoteDelete", rid }
// links: this calendar's links after (those to be made by localCreate and
// remoteCreate are added as they're made). refused: more than half of the
// links went at once (the safety guard): nothing is done.
function plan(o) {
  var now = o.now || new Date()
  var w = span(now)
  var mid = o.last ? (o.last + now.getTime()) / 2 : now.getTime()
  var local = {}
  ;(o.local || []).forEach(function(e) { local[e.id] = e })
  var remote = o.remote || {}
  var assigned = o.assigned || {}
  var actions = [], kept = [], gone = 0
  var linkedRid = {}, linkedNb = {}

  ;(o.links || []).forEach(function(l) {
    var rem = remote[l.rid], loc = local[l.nb]
    linkedRid[l.rid] = true
    linkedNb[l.nb] = true
    if (!rem && !loc) { gone++; return }
    if (!rem) {
      // (Gone there, or only out of the days asked for.)
      if (l.recurring || (String(l.start).slice(0, 10) >= w[0] && String(l.start).slice(0, 10) <= w[1])) {
        actions.push({ op: "localDelete", nb: l.nb, title: l.title })
        gone++
      } else kept.push(l)
      return
    }
    if (!loc) { actions.push({ op: "remoteDelete", rid: l.rid, title: l.title }); gone++; return }
    // (Given to another calendar here: out of this one; there at its next sync.)
    if (assigned[l.nb] && assigned[l.nb] !== o.cal) { actions.push({ op: "remoteDelete", rid: l.rid, title: l.title, moved: true }); return }
    var rn = rem.n, ln = norm(loc)
    var rf = fp(rn, rem.repeat), lf = fp(ln, loc.repeat)
    var link = { nb: l.nb, cal: o.cal, rid: l.rid, fp: l.fp, title: l.title, start: l.start, recurring: !!rem.repeat }
    if (rf === lf) { link.fp = rf; link.title = rn.title; link.start = rn.start; kept.push(link); return }
    var useRemote
    if (!l.fp) useRemote = true
    else {
      var rChanged = rf !== l.fp, lChanged = lf !== l.fp
      useRemote = rChanged && lChanged ? rem.modified >= mid : rChanged
    }
    if (useRemote) {
      actions.push({ op: "localUpdate", nb: l.nb, n: rn, repeat: rem.repeat, title: rn.title })
      link.fp = rf
      link.title = rn.title
      link.start = rn.start
    } else if (rem.repeat) {
      // (A series changed here: its title and place go there; its times
      // and repeat are the series' there.)
      var merged = { title: ln.title, start: rn.start, end: rn.end, allDay: rn.allDay, place: ln.place }
      actions.push({ op: "remoteUpdate", rid: l.rid, n: merged, recurring: true, title: ln.title })
      if (fp(merged, rem.repeat) !== lf) actions.push({ op: "localUpdate", nb: l.nb, n: merged, repeat: rem.repeat, title: ln.title })
      link.fp = fp(merged, rem.repeat)
      link.title = ln.title
    } else {
      actions.push({ op: "remoteUpdate", rid: l.rid, n: ln, recurring: false, title: ln.title })
      link.fp = lf
      link.title = ln.title
      link.start = ln.start
    }
    kept.push(link)
  })

  var links = o.links || []
  if (links.length && gone > Math.max(5, Math.floor(links.length / 2)))
    return { actions: [], links: links, deletions: gone, refused: true }

  // [fork] Unlinked on both sides and the same event: linked, not made
  // again (a lost link would otherwise double every event, both ways).
  var elsewhere = o.linkedElsewhere || {}
  var unlinkedLocal = {}
  ;(o.local || []).forEach(function(e) {
    if (linkedNb[e.id] || elsewhere[e.id] || e.repeat) return
    if ((assigned[e.id] || o.fallback || LOCAL) !== o.cal) return
    var f = fp(norm(e), null)
    ;(unlinkedLocal[f] = unlinkedLocal[f] || []).push(e)
  })
  var paired = {}, fresh = []
  Object.keys(remote).forEach(function(rid) {
    if (linkedRid[rid]) return
    var rem = remote[rid]
    var f = fp(rem.n, rem.repeat)
    var pool = rem.repeat ? null : unlinkedLocal[f]
    if (pool && pool.length) {
      var e = pool.shift()
      paired[e.id] = true
      kept.push({ nb: e.id, cal: o.cal, rid: rid, fp: f, title: rem.n.title, start: rem.n.start, recurring: false })
    } else fresh.push(rid)
  })

  // New there: here.
  fresh.forEach(function(rid) {
    var rem = remote[rid]
    actions.push({ op: "localCreate", rid: rid, n: rem.n, repeat: rem.repeat, title: rem.n.title })
  })

  // New here, for this calendar: there. (Repeating ones stay here: their
  // repeat isn't sent yet.)
  ;(o.local || []).forEach(function(e) {
    if (linkedNb[e.id] || elsewhere[e.id] || paired[e.id]) return
    if ((assigned[e.id] || o.fallback || LOCAL) !== o.cal) return
    if (e.repeat) return
    if (String(e.end).slice(0, 10) < w[0] || String(e.start).slice(0, 10) > w[1]) return
    actions.push({ op: "remoteCreate", nb: e.id, n: norm(e), title: trim(e.title) })
  })

  // [fork] A calendar that already has links and suddenly wants to make
  // many events is not trusted (lost links look like this): not synced.
  var made = { in: 0, out: 0 }
  actions.forEach(function(a) { if (a.op === "localCreate") made.in++; else if (a.op === "remoteCreate") made.out++ })
  var most = o.maxNew || MAX_NEW
  if (links.length && (made.in > most || made.out > most))
    return { actions: [], links: links, deletions: gone, refused: true, reason: "would make " + made.in + " here and " + made.out + " there at once (safety guard)" }

  return { actions: actions, links: kept, deletions: gone, refused: false }
}

// ---- [fork] Google and Office 365 straight, nothing of it here --------------------------------
//
// planBridge({ o365: { rid: remote }, google: { rid: remote }, links: [{ o, g, fp,
//   title, start }], last, now, maxNew }) -> { actions, links, deletions, refused, reason }
//
// actions: { op: "createG"|"createO", n } | { op: "updateG"|"updateO", rid, n }
//   | { op: "deleteG"|"deleteO", rid }. createG/createO are linked by the caller
//   ({ o, g }). Single events only: repeating ones stay where they are.
function planBridge(o) {
  var now = o.now || new Date()
  var w = span(now)
  var mid = o.last ? (o.last + now.getTime()) / 2 : now.getTime()
  function singles(map) {
    var out = {}
    Object.keys(map || {}).forEach(function(k) { if (!map[k].repeat) out[k] = map[k] })
    return out
  }
  var O = singles(o.o365), G = singles(o.google)
  var links = o.links || []
  var actions = [], kept = [], gone = 0, usedO = {}, usedG = {}
  function inWindow(start) { var d = String(start).slice(0, 10); return d >= w[0] && d <= w[1] }

  links.forEach(function(l) {
    var ro = O[l.o], rg = G[l.g]
    usedO[l.o] = true
    usedG[l.g] = true
    if (!ro && !rg) { gone++; return }
    if (!ro || !rg) {
      // (Gone on one side, or only out of the days asked for.)
      if (!inWindow(l.start)) { kept.push(l); return }
      actions.push(ro ? { op: "deleteO", rid: l.o, title: l.title } : { op: "deleteG", rid: l.g, title: l.title })
      gone++
      return
    }
    var fo = fp(ro.n, null), fg = fp(rg.n, null)
    var link = { o: l.o, g: l.g, fp: fo, title: ro.n.title, start: ro.n.start }
    if (fo !== fg) {
      var useO
      if (!l.fp) useO = true
      else {
        var oc = fo !== l.fp, gc = fg !== l.fp
        useO = oc && gc ? ro.modified >= rg.modified : oc
      }
      if (useO) actions.push({ op: "updateG", rid: l.g, n: ro.n, title: ro.n.title })
      else {
        actions.push({ op: "updateO", rid: l.o, n: rg.n, title: rg.n.title })
        link.fp = fg
        link.title = rg.n.title
        link.start = rg.n.start
      }
    }
    kept.push(link)
  })
  if (links.length && gone > Math.max(5, Math.floor(links.length / 2)))
    return { actions: [], links: links, deletions: gone, refused: true, reason: gone + " of " + links.length + " events gone at once (safety guard)" }

  // New on one side: the same event on the other is linked, else made there.
  var freeG = {}
  Object.keys(G).forEach(function(rid) {
    if (usedG[rid]) return
    var f = fp(G[rid].n, null)
    ;(freeG[f] = freeG[f] || []).push(rid)
  })
  var made = { g: 0, o: 0 }
  Object.keys(O).forEach(function(rid) {
    if (usedO[rid]) return
    var f = fp(O[rid].n, null), pool = freeG[f]
    if (pool && pool.length) {
      kept.push({ o: rid, g: pool.shift(), fp: f, title: O[rid].n.title, start: O[rid].n.start })
      return
    }
    actions.push({ op: "createG", rid: rid, n: O[rid].n, title: O[rid].n.title })
    made.g++
  })
  Object.keys(freeG).forEach(function(f) {
    freeG[f].forEach(function(rid) {
      actions.push({ op: "createO", rid: rid, n: G[rid].n, title: G[rid].n.title })
      made.o++
    })
  })
  var most = o.maxNew || MAX_NEW
  if (links.length && (made.g > most || made.o > most))
    return { actions: [], links: links, deletions: gone, refused: true, reason: "would make " + made.g + " in Google and " + made.o + " in Office 365 at once (safety guard)" }
  return { actions: actions, links: kept, deletions: gone, refused: false }
}

// Our event, changed to the one there (or made from it).
function localEvent(cur, n, repeat, extra) {
  var e = cur ? JSON.parse(JSON.stringify(cur)) : { alert: n.allDay ? -1 : 10 }
  e.title = n.title
  e.start = n.start
  e.end = n.end
  e.allDay = n.allDay
  e.place = n.place
  var r = repeatOf(repeat)
  e.repeat = r ? { freq: r.freq, every: r.every, until: r.until } : null
  if (extra) for (var k in extra) e[k] = extra[k]
  return e
}

// ---- signing in -------------------------------------------------------------------------------

// application/x-www-form-urlencoded.
function form(fields) {
  return Object.keys(fields).map(function(k) { return encodeURIComponent(k) + "=" + encodeURIComponent(fields[k]) }).join("&")
}
function query(fields) { return form(fields) }

// Random letters and digits (PKCE's verifier, a sign-in's state).
function randomText(n, random) {
  var r = typeof random === "function" ? random : Math.random
  var abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  var s = ""
  for (var i = 0; i < n; i++) s += abc.charAt(Math.floor(r() * abc.length))
  return s
}

// SHA-256 of ASCII text, as bytes.
function sha256(text) {
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  var bytes = []
  for (var i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i) & 0xff)
  var bits = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (var s = 56; s >= 0; s -= 8) bytes.push(s >= 32 ? 0 : (bits >>> s) & 0xff)
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)) }
  for (var off = 0; off < bytes.length; off += 64) {
    var W = []
    for (var t = 0; t < 64; t++) {
      if (t < 16) W[t] = (bytes[off + t * 4] << 24) | (bytes[off + t * 4 + 1] << 16) | (bytes[off + t * 4 + 2] << 8) | bytes[off + t * 4 + 3]
      else {
        var s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3)
        var s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10)
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0
      }
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]
    for (var j = 0; j < 64; j++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      var ch = (e & f) ^ (~e & g)
      var t1 = (h + S1 + ch + K[j] + W[j]) | 0
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      var maj = (a & b) ^ (a & c) ^ (b & c)
      var t2 = (S0 + maj) | 0
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0]
  }
  var out = []
  H.forEach(function(x) { out.push((x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff) })
  return out
}

function base64url(bytes) {
  var abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  var s = ""
  for (var i = 0; i < bytes.length; i += 3) {
    var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0)
    s += abc.charAt((n >> 18) & 63) + abc.charAt((n >> 12) & 63)
    if (i + 1 < bytes.length) s += abc.charAt((n >> 6) & 63)
    if (i + 2 < bytes.length) s += abc.charAt(n & 63)
  }
  return s
}

// PKCE (S256): { verifier, challenge }.
function pkce(random) {
  var v = randomText(64, random)
  return { verifier: v, challenge: base64url(sha256(v)) }
}

// What the sign-in page's answer came back with, on the address it was sent
// to: { code, state, error }.
function callback(path) {
  var q = String(path || "")
  var i = q.indexOf("?")
  var out = { code: "", state: "", error: "" }
  if (i < 0) return out
  q.slice(i + 1).split("&").forEach(function(kv) {
    var j = kv.indexOf("=")
    var k = j < 0 ? kv : kv.slice(0, j), v = j < 0 ? "" : kv.slice(j + 1)
    try { v = decodeURIComponent(v.replace(/\+/g, " ")) } catch (e) {}
    if (k === "code" || k === "state" || k === "error") out[k] = v
  })
  return out
}
