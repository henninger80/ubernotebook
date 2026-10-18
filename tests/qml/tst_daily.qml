import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"
import "../../Workspace.js" as Workspace
import "../../Dates.js" as Dates
import "../../Html.js" as Html

// [fork] Daily notes (Daily.js): Ctrl+Shift+T opens today's, made the first
// time (its page, its year's), from your template, among the others as they
// go; the calendar shows them and its button opens one; `daily` and
// `prepend` from a terminal.
Item {
  id: root
  width: 1320
  height: 900

  FakeFiles { id: files }
  FakeService { id: service; user: ({ sounds: false }) }
  Theme { id: th }
  UberNotebook.Workspace { id: ws; files: files }

  DocView {
    id: view
    anchors.fill: parent
    theme: th
    workspace: ws
    service: service
  }

  UberNotebook.Api {
    id: api
    workspace: ws
    files: files
    settings: service.settings
  }

  TestCase {
    name: "Daily"
    when: windowShown

    function fresh(user) {
      var u = { sounds: false }
      for (var k in (user || {})) u[k] = user[k]
      service.user = u
      view.startShown = false
      files.reset()
      view.libraryShown = false
      view.calendarShown = false
      view.page = null
      view.tagShown = ""
      view.history = []
      view.historyAt = -1
      ws.welcomed = false
      ws.written = ({})
      ws.load()
      tryCompare(ws, "ready", true, 2000)
      view.activate()
      tryVerify(function() { return view.page !== null || view.calendarShown || view.tagShown !== "" }, 2000)
    }
    function json(text) { return JSON.parse(text) }
    function fileOf(id) { return files.parseJson(files.disk[Workspace.pageFile(files.rootPath, id)] || "") }
    function titled(t) { return Object.keys(ws.index.pages).filter(function(id) { return ws.index.pages[id].title === t && !ws.index.pages[id].trashed }) }
    function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()) }
    function long(d) { return Dates.SHORT_DAYS[d.getDay()] + " " + d.getDate() + " " + Dates.SHORT_MONTHS[d.getMonth()] + " " + d.getFullYear() }
    function find(item, test) {
      if (!item) return null
      if (test(item)) return item
      for (var i = 0; i < item.children.length; i++) { var f = find(item.children[i], test); if (f) return f }
      return null
    }
    function named(item, name) { return find(item, function(it) { return it.objectName === name && it.visible }) }

    function test_1_ctrl_shift_t_makes_todays_once() {
      fresh()
      view.forceActiveFocus()
      keyClick(Qt.Key_T, Qt.ControlModifier | Qt.ShiftModifier)
      var t = "Daily note, " + long(today())
      tryVerify(function() { return view.page && view.page.title === t }, 2000, view.page ? view.page.title : "")
      var id = view.page.id
      var parent = titled("Daily notes")
      compare(parent.length, 1, "its page, at the top")
      compare(ws.index.pages[parent[0]].parent, "")
      var year = ws.index.pages[id].parent
      compare(ws.index.pages[year].title, String(today().getFullYear()), "in its year's")
      compare(ws.index.pages[year].parent, parent[0])
      tryVerify(function() { return fileOf(year).blocks[id] && fileOf(year).blocks[id].type === "page" }, 2000, "its block on its year's page")
      tryVerify(function() { return fileOf(parent[0]).blocks[year] !== undefined }, 2000, "the year's on the page")
      // Again: the same one.
      view.openDaily("")
      tryCompare(view.page, "id", id)
      compare(titled(t).length, 1)
      compare(titled("Daily notes").length, 1)
    }

    function test_2_from_your_template_among_the_others() {
      fresh({ dailyParent: "Tagesnotizen" })
      var tpl = ws.createPage({ parent: "", title: "Tagesnotiz, {{date}}", blocks: [{ type: "h1", html: "Tagesnotiz, {{date}}", indent: 0 }, { type: "p", html: "{{weekday}}", indent: 0 }] })
      ws.setTemplate(tpl.id, true)
      var top = ws.createPage({ parent: "", title: "Tagesnotizen" })
      var y = ws.createPage({ parent: top.id, title: "2026" })
      ws.editPage(top.id, function(p) { return Workspace.appendPageBlock(p, y.id) })
      var a = ws.createPage({ parent: y.id, title: "Tagesnotiz, Thu 15 Oct 2026" })
      var b = ws.createPage({ parent: y.id, title: "Tagesnotiz, Mon 12 Oct 2026" })
      ws.editPage(y.id, function(p) { Workspace.appendPageBlock(p, a.id); return Workspace.appendPageBlock(p, b.id) })
      wait(100)
      view.openDaily("2026-10-14")
      tryVerify(function() { return view.page && view.page.title === "Tagesnotiz, Wed 14 Oct 2026" }, 2000, view.page ? view.page.title : "")
      var id = view.page.id
      compare(ws.index.pages[id].parent, y.id, "in its year's")
      compare(ws.index.pages[y.id].children[0], id, "first, as the newest are")
      tryVerify(function() { var c = fileOf(y.id).content; return c.indexOf(id) >= 0 && c.indexOf(id) < c.indexOf(a.id) }, 2000, "its block first too")
      var p = fileOf(id)
      var text = Workspace.flatten(p).map(function(x) { return Html.plainText(x.html || "") }).join("|")
      verify(text.indexOf("Wednesday") >= 0, "filled in for its day: " + text)
      // The one there already: found, not made again.
      view.openDaily("2026-10-15")
      tryCompare(view.page, "id", a.id)
      // A year with none yet: made, first.
      view.openDaily("2027-01-04")
      tryVerify(function() { return view.page && view.page.title === "Tagesnotiz, Mon 4 Jan 2027" }, 2000)
      var y27 = ws.index.pages[view.page.id].parent
      compare(ws.index.pages[y27].title, "2027")
      compare(ws.index.pages[top.id].children[0], y27)
    }

    function test_3_on_the_calendar() {
      fresh({ dailyParent: "Tagesnotizen", dailyByYear: false })
      var top = ws.createPage({ parent: "", title: "Tagesnotizen" })
      var d = today()
      var one = ws.createPage({ parent: top.id, title: "Tagesnotiz, " + long(d) })
      view.openCalendar("", false)
      var cal = named(view, "calDaily")
      verify(cal, "the button")
      tryVerify(function() { return view.calendarView.notes.some(function(n) { return n.kind === "daily" && n.page === one.id && n.title === "Tagesnotiz" }) }, 2000)
      mouseClick(cal)
      tryCompare(view.page, "id", one.id)
      compare(ws.index.pages[one.id].parent, top.id)
    }

    function test_4_from_a_terminal() {
      fresh({ dailyParent: "Journal", dailyByYear: false })
      var r = json(api.daily("2026-10-16"))
      verify(r.ok, JSON.stringify(r))
      compare(r.title, "Daily note, Fri 16 Oct 2026")
      compare(r.made, true)
      compare(r.path, "Journal / Daily note, Fri 16 Oct 2026")
      var r2 = json(api.daily("2026-10-16"))
      compare(r2.id, r.id)
      compare(r2.made, false)
      compare(json(api.daily("16.10.")).ok, false, "a day as 2026-10-16")
      // prepend: before the first block.
      files.disk["/tmp/in/p.md"] = "#Kopfsprung · Teilnehmer: Sam"
      var before = fileOf(r.id).content.length
      var r3 = json(api.prepend(r.id, "/tmp/in/p.md"))
      verify(r3.ok, JSON.stringify(r3))
      var p = fileOf(r.id)
      compare(p.content.length, before + 1)
      verify(Html.plainText(p.blocks[p.content[0]].html).indexOf("#Kopfsprung") === 0, p.blocks[p.content[0]].html)
      verify(p.blocks[p.content[0]].html.indexOf("uber-notebook://tag/kopfsprung") >= 0, "a tag")
    }

    // The start page (startPage): the first time only.
    function test_6_the_start_page() {
      fresh({ startPage: "daily" })
      tryVerify(function() { return view.page && view.page.title === "Daily note, " + long(today()) }, 2000, view.page ? view.page.title : "")
      var daily = view.page.id
      var other = ws.createPage({ parent: "", title: "Plans" })
      view.open(other.id)
      tryCompare(view.page, "id", other.id)
      view.activate()
      compare(view.page.id, other.id, "after that, where you were")
      fresh({ startPage: "Plans" })
      compare(view.page.title, "Getting started", "a page that isn't there: where you were")
      var plans = ws.createPage({ parent: "", title: "Plans" })
      view.page = null
      view.startShown = false
      view.activate()
      tryCompare(view.page, "id", plans.id)
      fresh({ startPage: "calendar" })
      verify(view.calendarShown)
      fresh({ startPage: "tag:todo" })
      compare(view.tagShown, "todo")
    }

    // move <id> <parent> <position>: the place holds inside a page too.
    function test_5_moved_into_a_page_at_its_place() {
      fresh({})
      var y = ws.createPage({ parent: "", title: "2026" })
      var a = ws.createPage({ parent: y.id, title: "Thu 15 Oct 2026" })
      var b = ws.createPage({ parent: y.id, title: "Wed 14 Oct 2026" })
      ws.editPage(y.id, function(p) { Workspace.appendPageBlock(p, a.id); return Workspace.appendPageBlock(p, b.id) })
      var c = ws.createPage({ parent: "", title: "Fri 16 Oct 2026" })
      wait(100)
      var r = json(api.move(c.id, y.id, "0"))
      verify(r.ok, JSON.stringify(r))
      tryVerify(function() { return fileOf(y.id).content.indexOf(c.id) >= 0 }, 2000)
      wait(100)
      var order = fileOf(y.id).content.filter(function(x) { return x === a.id || x === b.id || x === c.id })
      compare(order, [c.id, a.id, b.id], "first on the page")
      compare(ws.index.pages[y.id].children.slice(0, 3), [c.id, a.id, b.id], "and in the tree")
      compare(ws.index.pages[c.id].parent, y.id)
      verify(fileOf(c.id).parent === y.id)
      // At the end, with "".
      verify(json(api.move(a.id, y.id, "")).ok)
      wait(200)
      compare(ws.index.pages[y.id].children.filter(function(x) { return x === a.id || x === b.id || x === c.id }), [c.id, b.id, a.id])
    }
  }
}
