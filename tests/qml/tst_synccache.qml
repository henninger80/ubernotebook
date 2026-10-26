import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../Calendar.js" as Calendar

// [fork] The synced calendars' events kept on each computer (Sync.qml's
// cache.json), not in Pages/calendar.json: two computers, one calendar.json
// between them (as Nextcloud carries it), one Office 365. The computer that
// synced moves its events into its cache, the other starts afresh; an event
// made on either is on the other after their syncs, once, and calendar.json
// keeps the "Here only" ones alone.
Item {
  id: root

  QtObject {
    id: fakeFiles
    property var disk: ({})
    function readNow(path) { return disk[path] === undefined ? null : disk[path] }
    function writeFile(path, text, done) { var d = {}; for (var k in disk) d[k] = disk[k]; d[path] = text; disk = d; if (done) done(true) }
    function privateMkdir(paths) { return ["mkdir"].concat(paths) }
    function exec(argv, done) { if (done) done(true, argv[0] === "/usr/bin/readlink" ? "/usr/share/zoneinfo/Europe/Berlin\n" : "") }
    function openUrl(url) {}
  }

  // As Workspace.qml: calendar.json read and written through the cache.
  component FakeWorkspace: QtObject {
    property var files: null
    property string folder: "/notes/Pages"
    property var calendar: Calendar.make()
    property int calendarRevision: 0
    property bool calendarLoaded: false
    property var calendarCache: null
    function loadCalendar() {
      var t = files.readNow(folder + "/calendar.json")
      var c = Calendar.clean(t ? JSON.parse(t) : null)
      calendar = calendarCache ? calendarCache.mergedCalendar(c) : c
      calendarLoaded = true
      calendarRevision++
    }
    function writeCalendar() {
      var keep = calendarCache ? calendarCache.sharedCalendar(calendar) : calendar
      if (keep) files.writeFile(folder + "/calendar.json", JSON.stringify(keep))
    }
    function setCalendar(next) { calendar = Calendar.clean(next); calendarRevision++; writeCalendar() }
    function scheduleReminders() {}
  }
  FakeWorkspace { id: deskWs; files: fakeFiles }
  FakeWorkspace { id: lapWs; files: fakeFiles }

  // Office 365: one calendar.
  QtObject {
    id: graph
    property var events: []
    property int next: 1
    function answer(method, url, o, done) {
      var body = o.json
      var m
      if (/oauth2\/v2\.0\/token/.test(url)) { done(200, { access_token: "t", refresh_token: "r", expires_in: 3600 }, ""); return }
      if (/\/me\/calendars\?/.test(url)) { done(200, { value: [{ id: "C1", name: "Calendar", hexColor: "", isDefaultCalendar: true, canEdit: true }] }, ""); return }
      if (/\/me\/calendars\/C1\/events\?/.test(url)) { done(200, { value: events }, ""); return }
      if (/\/me\/calendars\/C1\/events$/.test(url) && method === "POST") {
        var id = "G" + (next++)
        events = events.concat([{ id: id, subject: body.subject, type: "singleInstance", isAllDay: body.isAllDay, start: body.start, end: body.end, location: body.location, lastModifiedDateTime: new Date().toISOString() }])
        done(201, { id: id }, ""); return
      }
      if ((m = /\/me\/events\/([^/?]+)$/.exec(url)) && method === "DELETE") {
        var rid = decodeURIComponent(m[1])
        events = events.filter(function(e) { return e.id !== rid })
        done(204, {}, ""); return
      }
      done(404, { error: { message: "not here: " + url } }, "")
    }
  }

  property var openProfile: ({ id: "p-1", name: "Arbeit", demo: false })
  property bool deskReady: false
  property bool lapReady: false
  UberNotebook.Sync { id: desk; files: fakeFiles; workspace: deskWs; profile: root.openProfile; home: "/home/desk"; ready: root.deskReady; transport: graph.answer }
  UberNotebook.Sync { id: lap; files: fakeFiles; workspace: lapWs; profile: root.openProfile; home: "/home/lap"; ready: root.lapReady; transport: graph.answer }

  function dt(day, time) { return { dateTime: day + "T" + time + ":00.0000000" } }
  function day(n) { var d = new Date(); d.setDate(d.getDate() + n); return Calendar.dayIso(d) }
  function titled(ws, t) { return ws.calendar.events.filter(function(e) { return e.title === t }) }
  function shared() { return JSON.parse(fakeFiles.disk["/notes/Pages/calendar.json"]).events.map(function(e) { return e.title }).sort() }
  function putState(home, name, value) { fakeFiles.writeFile(home + "/.local/state/uber-notebook-sync/" + name, JSON.stringify(value)) }

  TestCase {
    name: "SyncCache"
    when: windowShown

    function syncOnce(s) {
      s.syncNow()
      tryVerify(function() { return !s.running }, 3000)
      verify(s.last.ok, s.last.error)
    }

    function initTestCase() {
      // As it was: calendar.json with all of them; the desktop synced, the laptop's sync off (its links old).
      var here = Calendar.cleanEvent({ title: "Here", start: day(2) + "T08:00", end: day(2) + "T09:00" })
      var outlook = Calendar.cleanEvent({ title: "Meeting", start: day(3) + "T09:00", end: day(3) + "T10:00" })
      fakeFiles.writeFile("/notes/Pages/calendar.json", JSON.stringify({ version: 1, events: [here, outlook] }))
      graph.events = [{ id: "G-m", subject: "Meeting", type: "singleInstance", isAllDay: false, start: dt(day(3), "09:00"), end: dt(day(3), "10:00"), location: { displayName: "" }, lastModifiedDateTime: "2026-01-01T00:00:00Z" }]
      var cals = { "o365:C1": { provider: "o365", id: "C1", name: "Calendar", color: "", on: true, writable: true, primary: true } }
      var link = { nb: outlook.id, cal: "o365:C1", rid: "G-m", fp: "", title: "Meeting", start: outlook.start, recurring: false }
      ;["/home/desk", "/home/lap"].forEach(function(h) {
        putState(h, "config.json", { enabled: h === "/home/desk", interval: 60, profile: "p-1", defaultCal: "o365:C1", google: { clientId: "", clientSecret: "" }, calendars: cals })
        putState(h, "links.json", { version: 1, links: [link], last: { "o365:C1": Date.now() - 600000 } })
        putState(h, "assign.json", h === "/home/desk" ? { [here.id]: "local" } : {})
        putState(h, "tokens-o365.json", { access_token: "a", refresh_token: "r", expires_at: Date.now() + 3600000 })
      })
    }

    function test_1_the_desktop_moves_its_events_into_its_cache() {
      deskWs.loadCalendar()
      root.deskReady = true
      tryVerify(function() { return desk.loaded }, 2000)
      compare(shared(), ["Here"], "calendar.json: Here only")
      compare(titled(deskWs, "Meeting").length, 1, "still shown")
      compare(titled(deskWs, "Here").length, 1)
      compare(desk.links.length, 1, "its links kept")
      verify(fakeFiles.disk["/home/desk/.local/state/uber-notebook-sync/before-cache.json"] !== undefined, "what was, kept")
      syncOnce(desk)
      compare(graph.events.length, 1, "nothing made twice")
      compare(shared(), ["Here"])
    }

    function test_2_the_laptop_starts_afresh() {
      lapWs.loadCalendar()
      root.lapReady = true
      tryVerify(function() { return lap.loaded }, 2000)
      compare(lap.links.length, 0, "its old links dropped")
      compare(titled(lapWs, "Here").length, 1)
      compare(titled(lapWs, "Meeting").length, 0, "not yet: from Office 365 at its first sync")
      lap.setConfig({ enabled: true })
      syncOnce(lap)
      compare(titled(lapWs, "Meeting").length, 1)
      compare(graph.events.length, 1, "the Here only event not sent")
      compare(shared(), ["Here"])
    }

    function test_3_made_on_either_is_on_the_other_once() {
      var l = Calendar.cleanEvent({ title: "From the laptop", start: day(4) + "T10:00", end: day(4) + "T11:00" })
      lapWs.setCalendar(Calendar.withEvent(lapWs.calendar, l))
      compare(shared(), ["Here"], "kept on the laptop, not in calendar.json")
      syncOnce(lap)
      var d = Calendar.cleanEvent({ title: "From the desktop", start: day(5) + "T10:00", end: day(5) + "T11:00" })
      deskWs.setCalendar(Calendar.withEvent(deskWs.calendar, d))
      syncOnce(desk)
      syncOnce(lap)
      syncOnce(desk)
      ;[deskWs, lapWs].forEach(function(ws) {
        ;["Here", "Meeting", "From the laptop", "From the desktop"].forEach(function(t) { compare(titled(ws, t).length, 1, t) })
      })
      compare(graph.events.length, 3)
      compare(shared(), ["Here"])
    }

    function test_4_here_only_on_one_goes_from_office_365_and_into_calendar_json() {
      var e = titled(lapWs, "From the desktop")[0]
      lap.setCalendarOf(e.id, "local")
      compare(shared(), ["From the desktop", "Here"])
      syncOnce(lap)
      verify(!graph.events.some(function(g) { return g.subject === "From the desktop" }), "out of Office 365")
      syncOnce(desk)
      compare(titled(deskWs, "From the desktop").length, 0, "the desktop's copy gone with it")
      deskWs.loadCalendar()
      compare(titled(deskWs, "From the desktop").length, 1, "and there, from calendar.json, once read again")
    }

    function test_5_a_deleted_one_goes_from_both() {
      var e = titled(deskWs, "From the laptop")[0]
      deskWs.setCalendar(Calendar.without(deskWs.calendar, e.id))
      syncOnce(desk)
      syncOnce(lap)
      compare(titled(lapWs, "From the laptop").length, 0)
      compare(graph.events.length, 1)
    }

    function test_6_another_profile_is_not_touched() {
      root.openProfile = { id: "p-2", name: "Privat", demo: false }
      var before = fakeFiles.disk["/notes/Pages/calendar.json"]
      var all = { version: 1, events: lapWs.calendar.events }
      compare(lap.sharedCalendar(all).events.length, all.events.length, "all of it written")
      compare(lap.mergedCalendar({ version: 1, events: [] }).events.length, 0, "nothing of ours added")
      compare(fakeFiles.disk["/notes/Pages/calendar.json"], before)
      root.openProfile = { id: "p-1", name: "Arbeit", demo: false }
    }
  }
}
