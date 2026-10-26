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
  var out = {}, complex = [], series = {}
  ;(items || []).forEach(function(g) {
    if (!g || g.isCancelled || g.type === "occurrence" || g.type === "exception") return
    var repeat = null
    if (g.type === "seriesMaster") {
      if (!graphActive(g, today)) return
      var gc = recOfGraph(g) // [fork] for the bridge
      if (gc) series[g.id] = { rid: g.id, n: graphNorm(g), rec: gc, modified: Date.parse(g.lastModifiedDateTime) || 0 }
      repeat = graphRepeat(g)
      if (repeat === "complex") { complex.push(g.id); return }
    } else if (String(g.end.dateTime).slice(0, 10) < w[0] || String(g.start.dateTime).slice(0, 10) > w[1]) return
    out[g.id] = { rid: g.id, n: graphNorm(g), repeat: repeat, modified: Date.parse(g.lastModifiedDateTime) || 0 }
  })
  return { events: out, complex: complex, series: series }
}

// The times of complex series (calendarView): single events.
function graphTimes(items, complex, into) {
  var keep = {}
  complex.forEach(function(id) { keep[id] = true })
  ;(items || []).forEach(function(g) {
    if (g && !g.isCancelled && keep[g.seriesMasterId]) into[g.id] = { rid: g.id, n: graphNorm(g), repeat: null, modified: Date.parse(g.lastModifiedDateTime) || 0, instance: true }
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
  var out = {}, complex = [], series = {}
  ;(items || []).forEach(function(e) {
    if (!e || e.status === "cancelled" || e.recurringEventId || !e.start) return
    var gc = e.recurrence && e.recurrence.length ? recOfRrule(e) : null // [fork] for the bridge
    if (gc && (!gc.until || gc.until >= today)) series[e.id] = { rid: e.id, n: googleNorm(e), rec: gc, modified: Date.parse(e.updated) || 0 }
    var repeat = googleRepeat(e)
    if (repeat === "complex") { complex.push(e.id); return }
    if (repeat && repeat.until && repeat.until < today) return
    if (!repeat) {
      var n = googleNorm(e)
      if (n.end.slice(0, 10) < w[0] || n.start.slice(0, 10) > w[1]) return
    }
    out[e.id] = { rid: e.id, n: googleNorm(e), repeat: repeat, modified: Date.parse(e.updated) || 0 }
  })
  return { events: out, complex: complex, series: series }
}

// A complex series' times (its instances): single events.
function googleTimes(items, into) {
  ;(items || []).forEach(function(e) {
    if (e && e.status !== "cancelled" && e.start) into[e.id] = { rid: e.id, n: googleNorm(e), repeat: null, modified: Date.parse(e.updated) || 0, instance: true }
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
//   ({ o, g }). Series: see planSeries (a series of a pattern it can't say stays where it is). The times
//   of a complex series (remotes with `instance`) are not bridged, but an equal
//   single event on the other side is not made again next to them.
function planBridge(o) {
  var now = o.now || new Date()
  var w = span(now)
  var mid = o.last ? (o.last + now.getTime()) / 2 : now.getTime()
  function singles(map) {
    var out = {}
    Object.keys(map || {}).forEach(function(k) { if (!map[k].repeat && !map[k].instance) out[k] = map[k] })
    return out
  }
  function shadows(map) {
    var out = {}
    Object.keys(map || {}).forEach(function(k) { if (map[k].instance) out[fp(map[k].n, null)] = true })
    return out
  }
  var O = singles(o.o365), G = singles(o.google)
  var shadowO = shadows(o.o365), shadowG = shadows(o.google)
  var allLinks = o.links || []
  var links = allLinks.filter(function(l) { return !l.series })
  var sp = planSeries({ o365: o.o365Series, google: o.googleSeries, links: allLinks.filter(function(l) { return l.series }), today: dayIso(now) })
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
  gone += sp.deletions
  if (allLinks.length && gone > Math.max(5, Math.floor(allLinks.length / 2)))
    return { actions: [], links: allLinks, deletions: gone, refused: true, reason: gone + " of " + allLinks.length + " events gone at once (safety guard)" }

  // New on one side: the same event on the other is linked, else made there.
  var freeG = {}
  Object.keys(G).forEach(function(rid) {
    if (usedG[rid]) return
    var f = fp(G[rid].n, null)
    if (shadowO[f]) return
    ;(freeG[f] = freeG[f] || []).push(rid)
  })
  var made = { g: 0, o: 0 }
  Object.keys(O).forEach(function(rid) {
    if (usedO[rid]) return
    var f = fp(O[rid].n, null), pool = freeG[f]
    if (!(pool && pool.length) && shadowG[f]) return
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
  made.g += sp.made.g
  made.o += sp.made.o
  var most = o.maxNew || MAX_NEW
  if (allLinks.length && (made.g > most || made.o > most))
    return { actions: [], links: allLinks, deletions: gone, refused: true, reason: "would make " + made.g + " in Google and " + made.o + " in Office 365 at once (safety guard)" }
  return { actions: actions.concat(sp.actions), links: kept.concat(sp.links), deletions: gone, refused: false }
}

// ---- [fork] series, in the bridge --------------------------------------------------------------
//
// A series is bridged as a whole: its title, place, time of day and pattern
// (not the odd day moved or dropped from it, those stay where they are). Its
// pattern is kept in one plain form both sides convert to and from:
//   { freq: "daily"|"weekly"|"monthly"|"yearly", interval, days: ["MO"..],
//     nth (1-4, -1: the 2nd Tuesday), monthday, month, until: "YYYY-MM-DD", count }
// A series it can't say that way (null) stays where it is. Office 365 leads:
// where the two differ, Google gets Office 365's.

var WEEK = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
var GRAPH_DAY = { monday: "MO", tuesday: "TU", wednesday: "WE", thursday: "TH", friday: "FR", saturday: "SA", sunday: "SU" }
var DAY_GRAPH = { MO: "monday", TU: "tuesday", WE: "wednesday", TH: "thursday", FR: "friday", SA: "saturday", SU: "sunday" }
var GRAPH_INDEX = { first: 1, second: 2, third: 3, fourth: 4, last: -1 }
var INDEX_GRAPH = { "1": "first", "2": "second", "3": "third", "4": "fourth", "-1": "last" }

function sortDays(list) { return list.slice().sort(function(a, b) { return WEEK.indexOf(a) - WEEK.indexOf(b) }) }
function dayOfIso(iso) { var d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), 12); return WEEK[(d.getDay() + 6) % 7] }
function blankRec(freq, interval) { return { freq: freq, interval: Math.max(1, Number(interval) || 1), days: [], nth: 0, monthday: 0, month: 0, until: "", count: 0 } }

// Office 365's recurrence -> the plain form, or null.
function recOfGraph(g) {
  var rec = g && g.recurrence
  if (!rec || !rec.pattern) return null
  var p = rec.pattern, r = rec.range || {}, c
  var days = (p.daysOfWeek || []).map(function(d) { return GRAPH_DAY[String(d).toLowerCase()] }).filter(Boolean)
  if (p.type === "daily") c = blankRec("daily", p.interval)
  else if (p.type === "weekly") { c = blankRec("weekly", p.interval); c.days = sortDays(days) }
  else if (p.type === "absoluteMonthly") { c = blankRec("monthly", p.interval); c.monthday = Number(p.dayOfMonth) || 0 }
  else if (p.type === "relativeMonthly") { c = blankRec("monthly", p.interval); c.days = sortDays(days); c.nth = GRAPH_INDEX[String(p.index).toLowerCase()] || 0 }
  else if (p.type === "absoluteYearly") { c = blankRec("yearly", 1); c.month = Number(p.month) || 0; c.monthday = Number(p.dayOfMonth) || 0 }
  else if (p.type === "relativeYearly") { c = blankRec("yearly", 1); c.month = Number(p.month) || 0; c.days = sortDays(days); c.nth = GRAPH_INDEX[String(p.index).toLowerCase()] || 0 }
  else return null
  if (c.freq === "monthly" && !c.nth && !c.monthday) return null
  if (c.freq === "monthly" && c.nth && c.days.length !== 1) return null
  if (c.freq === "yearly" && (!c.month || (!c.monthday && !(c.nth && c.days.length === 1)))) return null
  if (r.type === "endDate" && r.endDate) c.until = String(r.endDate).slice(0, 10)
  else if (r.type === "numbered") c.count = Number(r.numberOfOccurrences) || 0
  return c
}

// An RRULE -> the plain form, or null. start: the series' first day.
function recOfRrule(e) {
  var rules = (e.recurrence || []).filter(function(l) { return /^RRULE:/i.test(l) })
  if (rules.length !== 1 || !e.start) return null
  var parts = {}
  rules[0].replace(/^RRULE:/i, "").split(";").forEach(function(kv) {
    var i = kv.indexOf("=")
    if (i > 0) parts[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1).toUpperCase()
  })
  var start = String(e.start.date || e.start.dateTime).slice(0, 10)
  var every = parts.INTERVAL
  var days = [], nth = 0
  if (parts.BYDAY) {
    var bad = false
    parts.BYDAY.split(",").forEach(function(d) {
      var m = /^(-?\d)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(d)
      if (!m) { bad = true; return }
      if (m[1]) nth = Number(m[1])
      days.push(m[2])
    })
    if (bad) return null
  }
  if (parts.BYSETPOS) {
    if (parts.BYSETPOS.indexOf(",") >= 0) return null
    nth = Number(parts.BYSETPOS)
  }
  var c
  if (parts.FREQ === "DAILY") { if (parts.BYDAY) return null; c = blankRec("daily", every) }
  else if (parts.FREQ === "WEEKLY") { if (nth) return null; c = blankRec("weekly", every); c.days = sortDays(days.length ? days : [dayOfIso(start)]) }
  else if (parts.FREQ === "MONTHLY") {
    c = blankRec("monthly", every)
    if (days.length) { if (days.length !== 1 || !nth || parts.BYMONTHDAY) return null; c.days = days; c.nth = nth }
    else {
      if (parts.BYMONTHDAY && parts.BYMONTHDAY.indexOf(",") >= 0) return null
      c.monthday = Number(parts.BYMONTHDAY) || Number(start.slice(8, 10))
    }
  } else if (parts.FREQ === "YEARLY") {
    c = blankRec("yearly", 1)
    if (Number(every) > 1 || (parts.BYMONTH || "").indexOf(",") >= 0) return null
    c.month = Number(parts.BYMONTH) || Number(start.slice(5, 7))
    if (days.length) { if (days.length !== 1 || !nth) return null; c.days = days; c.nth = nth }
    else c.monthday = Number(parts.BYMONTHDAY) || Number(start.slice(8, 10))
  } else return null
  if (parts.COUNT) c.count = Number(parts.COUNT) || 0
  else if (parts.UNTIL) c.until = parts.UNTIL.slice(0, 4) + "-" + parts.UNTIL.slice(4, 6) + "-" + parts.UNTIL.slice(6, 8)
  return c
}

// The plain form -> an RRULE (allDay: UNTIL is a date, else the end of that day, UTC).
function rruleOf(c, allDay) {
  var s = "FREQ=" + c.freq.toUpperCase()
  if (c.interval > 1) s += ";INTERVAL=" + c.interval
  if (c.freq === "weekly") s += ";BYDAY=" + c.days.join(",")
  if (c.freq === "monthly") s += c.nth ? ";BYDAY=" + c.nth + c.days[0] : ";BYMONTHDAY=" + c.monthday
  if (c.freq === "yearly") s += ";BYMONTH=" + c.month + (c.nth ? ";BYDAY=" + c.nth + c.days[0] : ";BYMONTHDAY=" + c.monthday)
  if (c.count) s += ";COUNT=" + c.count
  else if (c.until) s += ";UNTIL=" + c.until.replace(/-/g, "") + (allDay ? "" : "T235959Z")
  return "RRULE:" + s
}

// The plain form -> Office 365's recurrence. start: the series' first day.
function graphRecurrence(c, start, tz) {
  var p = { interval: c.interval, month: 0, dayOfMonth: 0, daysOfWeek: [], firstDayOfWeek: "sunday", index: "first" }
  if (c.freq === "daily") p.type = "daily"
  else if (c.freq === "weekly") { p.type = "weekly"; p.daysOfWeek = c.days.map(function(d) { return DAY_GRAPH[d] }) }
  else if (c.freq === "monthly") {
    if (c.nth) { p.type = "relativeMonthly"; p.daysOfWeek = [DAY_GRAPH[c.days[0]]]; p.index = INDEX_GRAPH[String(c.nth)] }
    else { p.type = "absoluteMonthly"; p.dayOfMonth = c.monthday }
  } else {
    p.interval = 1
    p.month = c.month
    if (c.nth) { p.type = "relativeYearly"; p.daysOfWeek = [DAY_GRAPH[c.days[0]]]; p.index = INDEX_GRAPH[String(c.nth)] }
    else { p.type = "absoluteYearly"; p.dayOfMonth = c.monthday }
  }
  var r = { startDate: start, recurrenceTimeZone: tz }
  if (c.count) { r.type = "numbered"; r.numberOfOccurrences = c.count }
  else if (c.until) { r.type = "endDate"; r.endDate = c.until }
  else r.type = "noEnd"
  return { pattern: p, range: r }
}

// The two fingerprints of a series: what makes it that series (title, time of
// day, place, pattern), and all of it (the end too). Not the first day.
function seriesKey(n, c) {
  return JSON.stringify([n.title, n.allDay ? "" : n.start.slice(11, 16), n.allDay ? "" : n.end.slice(11, 16), n.allDay, n.place,
                         c.freq, c.interval, c.days, c.nth, c.monthday, c.month])
}
function seriesFp(n, c) { return seriesKey(n, c) + JSON.stringify([c.until, c.count]) }

function dayCount(a, b) { return Math.round((Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10))) - Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)))) / 86400000) }

// n (a series' title, place and times), on the other series' first day.
function rebase(n, base) {
  var d0 = String(base.start).slice(0, 10)
  var d1 = addDaysIso(d0, dayCount(n.start.slice(0, 10), n.end.slice(0, 10)))
  return { title: n.title, place: n.place, allDay: n.allDay, start: n.allDay ? d0 : d0 + n.start.slice(10), end: n.allDay ? d1 : d1 + n.end.slice(10) }
}

function graphSeriesBody(n, c, tz) {
  var b = graphBody(n, tz)
  b.recurrence = graphRecurrence(c, n.start.slice(0, 10), tz)
  return b
}
function googleSeriesBody(n, c, tz) {
  var b = googleBody(n, tz)
  b.recurrence = [rruleOf(c, n.allDay)]
  return b
}

// A series that has run out by today (an end date, or a count of times that
// even the longest gaps put behind it).
function seriesOver(n, c, today) {
  if (c.until) return c.until < today
  if (!c.count) return false
  var gap = { daily: 1, weekly: 7, monthly: 31, yearly: 366 }[c.freq] * c.interval
  return addDaysIso(n.start.slice(0, 10), c.count * gap + 7) < today
}

// planSeries({ o365: { rid: series }, google: { rid: series }, links, today, maxNew })
//   series: { rid, n, rec } (n: the first time of it) -> { actions, links, deletions }
// actions: { op: "createG", series: true, rid (the source), n, rec, link }
//   | { op: "updateG", series: true, rid, n (rebased), rec, title }
//   | { op: "deleteG", series: true, rid, title }.
function planSeries(o) {
  var O = o.o365 || {}, G = o.google || {}, today = o.today
  var actions = [], kept = [], gone = 0, usedO = {}, usedG = {}
  ;(o.links || []).forEach(function(l) {
    var so = O[l.o], sg = G[l.g]
    usedO[l.o] = true
    usedG[l.g] = true
    if (!so && !sg) { gone++; return }
    if (!so || !sg) {
      if (l.until && l.until < today) { kept.push(l); return } // (ended)
      // (Office 365 leads: a series dropped from Google is left in Office 365,
      // and not made in Google again; one dropped from Office 365 goes.)
      if (so) { kept.push(l); return }
      actions.push({ op: "deleteG", series: true, rid: l.g, title: l.title })
      gone++
      return
    }
    var fo = seriesFp(so.n, so.rec), fg = seriesFp(sg.n, sg.rec)
    // (Only when one side changed since last time: a form Google gives back
    // otherwise would be sent again every sync.)
    if (fo !== fg && (fo !== l.fp || fg !== l.fg))
      actions.push({ op: "updateG", series: true, rid: l.g, n: rebase(so.n, sg.n), rec: so.rec, title: so.n.title })
    kept.push({ o: l.o, g: l.g, series: true, fp: fo, fg: fg, title: so.n.title, start: so.n.start, until: so.rec.until })
  })
  var free = {}
  Object.keys(G).forEach(function(rid) {
    if (usedG[rid]) return
    var k = seriesKey(G[rid].n, G[rid].rec)
    ;(free[k] = free[k] || []).push(rid)
  })
  var made = { g: 0, o: 0 }
  Object.keys(O).forEach(function(rid) {
    if (usedO[rid]) return
    var so = O[rid], k = seriesKey(so.n, so.rec), pool = free[k]
    if (!(pool && pool.length) && seriesOver(so.n, so.rec, today)) return
    if (pool && pool.length) {
      // (The same series already: linked as it is, Google's changed only later.)
      var g = pool.shift()
      kept.push({ o: rid, g: g, series: true, fp: seriesFp(so.n, so.rec), fg: seriesFp(G[g].n, G[g].rec), title: so.n.title, start: so.n.start, until: so.rec.until })
      return
    }
    actions.push({ op: "createG", series: true, rid: rid, n: so.n, rec: so.rec, title: so.n.title,
                   link: { series: true, fp: seriesFp(so.n, so.rec), fg: seriesFp(so.n, so.rec), title: so.n.title, start: so.n.start, until: so.rec.until } })
    made.g++
  })
  // (A series only in Google stays there: Office 365 leads.)
  return { actions: actions, links: kept, deletions: gone, made: made }
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

// ---- [fork] the synced calendars' events, kept on this computer -------------------------------
//
// Pages/calendar.json goes to the other computers with the pages (Nextcloud
// and the like); the events of the calendars synced don't: each computer
// keeps its own, as it got them from there, beside its own links
// (Sync.qml's cache.json). Only "Here only" events are in calendar.json.
// Sync.qml shows both as one calendar and parts them again when it's saved.
//
// o: { assigned: { nb: key }, linked: { nb: key }, shared: { nb: true } (in
// calendar.json), fallback (the default calendar) }

// The calendar an event of ours is in, or goes to: a key, or LOCAL.
function calendarOfEvent(id, o) {
  if (o.assigned && o.assigned[id]) return o.assigned[id]
  if (o.linked && o.linked[id]) return o.linked[id]
  if (o.shared && o.shared[id]) return LOCAL
  return o.fallback || LOCAL
}

// The calendar parted: { shared: calendar.json's, cached: [events kept here] }.
function splitCalendar(cal, o) {
  var shared = [], cached = []
  ;((cal && cal.events) || []).forEach(function(e) {
    if (calendarOfEvent(e.id, o) === LOCAL) shared.push(e)
    else cached.push(e)
  })
  return { shared: { version: cal.version, events: shared }, cached: cached }
}

// Both as one calendar (calendar.json's first).
function mergeCalendar(shared, cached) {
  var seen = {}
  var events = []
  ;((shared && shared.events) || []).concat(cached || []).forEach(function(e) {
    if (seen[e.id]) return
    seen[e.id] = true
    events.push(e)
  })
  return { version: shared ? shared.version : 1, events: events }
}

// The first time, from calendar.json that had them all. "move" (where the
// links are this calendar's: the computer that synced): each event where it
// belongs, as before (one not linked and not given a calendar goes to the
// default one). "fresh" (a computer whose links aren't): what's linked or
// given a calendar elsewhere goes (it comes again from there, at the first
// sync), the rest stays in calendar.json, "Here only".
function firstSplit(cal, o, mode) {
  if (mode === "move") return splitCalendar(cal, { assigned: o.assigned, linked: o.linked, fallback: o.fallback })
  var shared = []
  ;((cal && cal.events) || []).forEach(function(e) {
    var a = o.assigned && o.assigned[e.id]
    if ((o.linked && o.linked[e.id]) || (a && a !== LOCAL)) return
    shared.push(e)
  })
  return { shared: { version: cal.version, events: shared }, cached: [] }
}

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
