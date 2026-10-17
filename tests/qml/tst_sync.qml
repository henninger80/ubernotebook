import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../Calendar.js" as Calendar
import "../../app"

// The calendar synced with Office 365 and Google (fork): Sync.qml with its
// files, our calendar and both services played here. What the script kept
// taken over; Office 365's and Google's calendars at once; an event made
// here to the default calendar; given another, it moves; the profile it's
// for; Settings → Accounts & sync.
Item {
  id: root
  width: 900
  height: 900

  // Files: { path: text }; exec answers readlink and mkdir.
  QtObject {
    id: fakeFiles
    property var disk: ({})
    property var opened: []
    function readNow(path) { return disk[path] === undefined ? null : disk[path] }
    function writeFile(path, text, done) { var d = {}; for (var k in disk) d[k] = disk[k]; d[path] = text; disk = d; if (done) done(true) }
    function privateMkdir(paths) { return ["mkdir"].concat(paths) }
    function exec(argv, done) { if (done) done(true, argv[0] === "/usr/bin/readlink" ? "/usr/share/zoneinfo/Europe/Berlin\n" : "") }
    function openUrl(url) { opened = opened.concat([url]) }
  }

  QtObject {
    id: fakeWorkspace
    property var calendar: Calendar.make()
    property int calendarRevision: 0
    function setCalendar(next) { calendar = Calendar.clean(next); calendarRevision++ }
  }

  // The services: Graph's and Google's calendars and events, kept here.
  QtObject {
    id: services
    property var calls: []
    property var graphCals: [{ id: "C1", name: "Calendar", hexColor: "", isDefaultCalendar: true, canEdit: true }]
    property var graphEvents: ({ C1: [] })
    property var googleCals: [{ id: "me@gmail.com", primary: true, summary: "me@gmail.com", backgroundColor: "#7986cb", accessRole: "owner" },
                               { id: "holidays", summary: "Holidays", backgroundColor: "#16a765", accessRole: "reader" }]
    property var googleEvents: ({ primary: [] })
    property int next: 1
    function answer(method, url, o, done) {
      calls = calls.concat([method + " " + url])
      var body = o.json
      var m
      if (/devicecode|oauth2\/v2\.0\/token|oauth2\.googleapis/.test(url)) { done(200, { access_token: "t", refresh_token: "r", expires_in: 3600 }, ""); return }
      if (/\/me\/calendars\?/.test(url)) { done(200, { value: graphCals }, ""); return }
      if ((m = /\/me\/calendars\/([^/]+)\/events\?/.exec(url))) { done(200, { value: graphEvents[decodeURIComponent(m[1])] || [] }, ""); return }
      if ((m = /\/me\/calendars\/([^/]+)\/events$/.exec(url)) && method === "POST") {
        var id = "G" + (next++)
        var cal = decodeURIComponent(m[1])
        var list = (graphEvents[cal] || []).concat([{ id: id, subject: body.subject, type: "singleInstance", isAllDay: body.isAllDay, start: body.start, end: body.end, location: body.location, lastModifiedDateTime: new Date().toISOString() }])
        var ge = {}; for (var k in graphEvents) ge[k] = graphEvents[k]; ge[cal] = list; graphEvents = ge
        done(201, { id: id }, ""); return
      }
      if ((m = /\/me\/events\/([^/?]+)$/.exec(url)) && method === "DELETE") {
        var rid = decodeURIComponent(m[1])
        var g2 = {}; for (var c in graphEvents) g2[c] = graphEvents[c].filter(function(e) { return e.id !== rid }); graphEvents = g2
        done(204, {}, ""); return
      }
      if (/calendarList/.test(url)) { done(200, { items: googleCals }, ""); return }
      if ((m = /\/calendars\/([^/]+)\/events\?/.exec(url))) { done(200, { items: googleEvents[decodeURIComponent(m[1])] || [] }, ""); return }
      if ((m = /\/calendars\/([^/]+)\/events$/.exec(url)) && method === "POST") {
        var gid = "g" + (next++)
        var gc = decodeURIComponent(m[1])
        var gl = (googleEvents[gc] || []).concat([{ id: gid, summary: body.summary, location: body.location, start: body.start, end: body.end, updated: new Date().toISOString() }])
        var gg = {}; for (var j in googleEvents) gg[j] = googleEvents[j]; gg[gc] = gl; googleEvents = gg
        done(200, { id: gid }, ""); return
      }
      done(404, { error: { message: "not here: " + url } }, "")
    }
  }

  property var openProfile: ({ id: "p-1", name: "Arbeit", demo: false })
  property bool pagesReady: false

  UberNotebook.Sync {
    id: sync
    files: fakeFiles
    workspace: fakeWorkspace
    profile: root.openProfile
    home: "/home/me"
    ready: root.pagesReady
    transport: services.answer
  }

  Theme { id: theme }
  SyncSettings { id: settingsPage; width: 800; theme: theme; sync: sync }

  function find(item, test) {
    if (!item) return null
    if (item.visible && test(item)) return item
    for (var i = 0; i < item.children.length; i++) {
      var f = find(item.children[i], test)
      if (f) return f
    }
    return null
  }
  function shown(t) { return find(settingsPage, function(i) { return i.text === t }) !== null }

  function dt(day, time) { return { dateTime: day + "T" + time + ":00.0000000" } }
  function eventTitled(t) { return fakeWorkspace.calendar.events.filter(function(e) { return e.title === t })[0] || null }
  function day(n) { var d = new Date(); d.setDate(d.getDate() + n); return Calendar.dayIso(d) }

  TestCase {
    name: "Sync"
    when: windowShown

    function initTestCase() {
      // What bin/o365-calendar-sync kept: one event linked, the sign-in.
      var ours = Calendar.cleanEvent({ title: "Wattenscheid", start: day(2) + "T12:30", end: day(2) + "T14:45" })
      fakeWorkspace.setCalendar(Calendar.withEvent(fakeWorkspace.calendar, ours))
      fakeFiles.writeFile("/home/me/.local/state/o365-sync/map.json", JSON.stringify({ last_sync: Date.now() / 1000 - 600,
        links: [{ nb: ours.id, g: "G-old", hash: "x", title: "Wattenscheid", start: ours.start, recurring: false }] }))
      fakeFiles.writeFile("/home/me/.local/state/o365-sync/token.json", JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 3600, obtained: Date.now() / 1000 }))
      fakeFiles.writeFile("/home/me/.local/state/o365-sync/config.json", JSON.stringify({ enabled: true, interval: 15, profile: "p-1" }))
      services.graphEvents = { C1: [{ id: "G-old", subject: "Wattenscheid", type: "singleInstance", isAllDay: false, start: dt(day(2), "12:30"), end: dt(day(2), "14:45"), location: { displayName: "" }, lastModifiedDateTime: "2026-01-01T00:00:00Z" },
                                    { id: "G-new", subject: "Kickoff", type: "singleInstance", isAllDay: false, start: dt(day(3), "09:00"), end: dt(day(3), "10:00"), location: { displayName: "Raum 1" }, lastModifiedDateTime: "2026-01-01T00:00:00Z" }] }
      root.pagesReady = true
      tryVerify(function() { return sync.loaded && sync.tz === "Europe/Berlin" }, 2000)
    }

    function test_1_what_the_script_kept_is_taken_over() {
      verify(sync.signedInMs, "Office 365's sign-in")
      compare(sync.interval, 15)
      compare(sync.links.length, 1)
      compare(sync.links[0].cal, "o365:@default")
      compare(sync.config.defaultCal, "o365:@default")
      verify(fakeFiles.disk["/home/me/.local/state/uber-notebook-sync/links.json"] !== undefined, "kept in its own folder")
    }

    function test_2_a_sync_with_office_365() {
      var mine = Calendar.cleanEvent({ title: "Dentist", start: day(4) + "T15:00", end: day(4) + "T16:00" })
      fakeWorkspace.setCalendar(Calendar.withEvent(fakeWorkspace.calendar, mine))
      sync.syncNow()
      tryVerify(function() { return !sync.running }, 3000)
      verify(sync.last.ok, sync.last.error)
      compare(sync.config.defaultCal, "o365:C1", "the script's calendar is Office 365's default one")
      compare(sync.links.filter(function(l) { return l.cal === "o365:C1" }).length, 3)
      var kick = eventTitled("Kickoff")
      verify(kick !== null, "Office 365's new event here")
      compare(kick.place, "Raum 1")
      compare(kick.start, day(3) + "T09:00")
      verify(services.graphEvents.C1.some(function(e) { return e.subject === "Dentist" }), "ours there, in the default calendar")
      compare(fakeWorkspace.calendar.events.filter(function(e) { return e.title === "Wattenscheid" }).length, 1, "the linked one not made twice")
    }

    function test_3_google_too_its_events_in_its_color() {
      services.googleEvents = { primary: [{ id: "gx", summary: "Geburtstag Oma", start: { date: day(5) }, end: { date: day(6) }, updated: "2026-01-01T00:00:00Z" }] }
      sync.setGoogleClient("id.apps.googleusercontent.com", "secret")
      sync.keepToken("google", { access_token: "t", refresh_token: "r", expires_in: 3600 }, "")
      sync.syncNow()
      tryVerify(function() { return !sync.running }, 3000)
      verify(sync.last.ok, sync.last.error)
      var keys = sync.calendars.map(function(c) { return c.key })
      verify(keys.indexOf("google:primary") >= 0 && keys.indexOf("google:holidays") >= 0, keys.join())
      var holidays = sync.calendars.filter(function(c) { return c.key === "google:holidays" })[0]
      verify(!holidays.on && !holidays.writable, "another calendar: off till you turn it on; read only")
      var b = eventTitled("Geburtstag Oma")
      verify(b !== null)
      verify(b.allDay)
      compare(b.end, day(5))
      compare(String(b.color), "#7986cb", "in its calendar's color")
      verify(!services.googleEvents.primary.some(function(e) { return e.summary === "Kickoff" }), "Office 365's events never go to Google")
    }

    function test_4_an_event_given_another_calendar_moves() {
      var dentist = eventTitled("Dentist")
      compare(sync.calendarOf(dentist.id), "o365:C1")
      sync.setCalendarOf(dentist.id, "google:primary")
      sync.syncNow()
      tryVerify(function() { return !sync.running }, 3000)
      verify(sync.last.ok, sync.last.error)
      verify(!services.graphEvents.C1.some(function(e) { return e.subject === "Dentist" }), "out of Office 365")
      // (Into Google at the next sync of it: Google's after Office 365's, so this one.)
      verify(services.googleEvents.primary.some(function(e) { return e.summary === "Dentist" }), "in Google")
      compare(sync.calendarOf(dentist.id), "google:primary")
      compare(fakeWorkspace.calendar.events.filter(function(e) { return e.title === "Dentist" }).length, 1)
    }

    function test_5_here_only() {
      var note = Calendar.cleanEvent({ title: "Private", start: day(6) + "T10:00", end: day(6) + "T11:00" })
      fakeWorkspace.setCalendar(Calendar.withEvent(fakeWorkspace.calendar, note))
      sync.setCalendarOf(note.id, "local")
      sync.syncNow()
      tryVerify(function() { return !sync.running }, 3000)
      verify(!services.graphEvents.C1.some(function(e) { return e.subject === "Private" }))
      verify(!services.googleEvents.primary.some(function(e) { return e.summary === "Private" }))
    }

    function test_6_a_calendar_turned_off_takes_its_events_with_it() {
      sync.setCalendarOn("google:primary", false)
      compare(eventTitled("Geburtstag Oma"), null)
      verify(eventTitled("Kickoff") !== null, "Office 365's stay")
      sync.setCalendarOn("google:primary", true)
    }

    function test_7_only_the_profile_synced() {
      root.openProfile = { id: "p-2", name: "Privat", demo: false }
      var before = services.calls.length
      sync.syncNow()
      verify(!sync.running)
      compare(services.calls.length, before, "nothing asked")
      verify(sync.last.error.indexOf("Privat") >= 0, sync.last.error)
      root.openProfile = { id: "p-1", name: "Arbeit", demo: false }
    }

    function test_8_settings_show_the_accounts_and_calendars() {
      verify(shown("Office 365"))
      verify(shown("Google"))
      verify(shown("Calendar"), "Office 365's calendar")
      verify(shown("Holidays"), "Google's other calendar")
      verify(shown("Office 365 \u00b7 default"), "the default one said")
      verify(shown("Google \u00b7 read only"))
      sync.signOut("google")
      verify(shown("Not signed in"))
      sync.setGoogleClient("", "")
      verify(find(settingsPage, function(i) { return i.objectName === "syncGoogleClient" }) !== null, "the client asked for first")
    }
  }
}
