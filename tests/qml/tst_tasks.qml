import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"
import "../../Workspace.js" as Workspace
import "../../Dates.js" as Dates

// [fork] Tasks (Tasks.js, TaskView.qml): every open to-do with its date,
// priority and tags, kept on the page's entry as it's saved (and as it's
// first read), in the Tasks view in its bucket, ticked there, on the
// calendar, and from a terminal.
Item {
  id: root
  width: 1320
  height: 900

  FakeFiles { id: files }
  FakeService { id: service; user: ({ sounds: false }) }
  Theme { id: th }
  UberNotebook.Workspace { id: ws; files: files }
  DocView { id: view; anchors.fill: parent; theme: th; workspace: ws; service: service }
  UberNotebook.Api { id: api; workspace: ws; files: files; settings: service.settings }

  TestCase {
    name: "Tasks"
    when: windowShown

    function fresh() {
      files.reset()
      view.page = null
      view.tasksShown = false
      view.history = []
      view.historyAt = -1
      ws.welcomed = false
      ws.written = ({})
      ws.load()
      tryCompare(ws, "ready", true, 2000)
      view.activate()
      tryVerify(function() { return view.page !== null }, 2000)
    }
    function find(item, test) {
      if (!item) return null
      if (test(item)) return item
      for (var i = 0; i < item.children.length; i++) { var f = find(item.children[i], test); if (f) return f }
      return null
    }
    function all(item, test, out) {
      var list = out || []
      if (!item) return list
      if (item.visible && test(item)) list.push(item)
      for (var i = 0; i < item.children.length; i++) all(item.children[i], test, list)
      return list
    }
    function named(item, name) { return find(item, function(it) { return it.objectName === name && it.visible }) }
    function fileOf(id) { return files.parseJson(files.disk[Workspace.pageFile(files.rootPath, id)] || "") }
    function day(n) { var d = new Date(); return Dates.iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)) }
    function dated(n) { return "<a href=\"uber-notebook://date/" + day(n) + "\">@" + day(n) + "</a>" }
    function tag(n) { return "<a href=\"uber-notebook://tag/" + n + "\">#" + n + "</a>" }
    function plans() {
      return ws.createPage({ parent: "", title: "Plans", blocks: [
        { type: "check", html: "Call the venue " + tag("todo") + " " + dated(-2), indent: 0 },
        { type: "check", html: "Book the bus " + tag("prio-hoch") + " " + dated(0), indent: 0 },
        { type: "check", html: "Order shirts " + tag("kopfsprung"), indent: 0 },
        { type: "check", html: "Done already", checked: true, indent: 0 },
        { type: "check", html: "", indent: 0 },
        { type: "p", html: "Words", indent: 0 }
      ] })
    }

    function test_1_kept_on_the_page_and_shown() {
      fresh()
      var p = plans()
      var tasks = ws.index.pages[p.id].tasks
      compare(tasks.length, 3, "the open ones with words")
      compare(tasks[1].p, 1)
      compare(tasks[1].d, day(0))
      compare(tasks[0].t, "Call the venue")
      // Saved in the tree.
      ws.flush()
      var onDisk = JSON.parse(files.disk[Workspace.indexFile(files.rootPath)]).pages[p.id].tasks
      compare(onDisk.length, 3)
      // The Tasks tile.
      var tile = named(view, "tasksTile")
      verify(tile, "in the sidebar")
      mouseClick(tile)
      verify(view.tasksShown)
      compare(view.page, null)
      var tv = view.taskView
      function mine(list) { return list.filter(function(t) { return t.page === p.id }).map(function(t) { return t.t }) }
      compare(mine(tv.list).length, 3)
      var others = tv.list.length - 3
      compare(mine(tv.groups[0].tasks), ["Call the venue"], "overdue")
      compare(mine(tv.groups[1].tasks), ["Book the bus"], "today")
      compare(mine(tv.groups[4].tasks), ["Order shirts"], "no date")
      compare(tv.groups[0].tasks.length + tv.groups[1].tasks.length, 2, "the starter's have no date")
      tryVerify(function() { return all(tv, function(it) { return it.objectName === "task" }).length === 2 }, 2000, "no date folded to start")
      mouseClick(named(tv, "taskBucket_none"))
      tryVerify(function() { return all(tv, function(it) { return it.objectName === "task" }).length === 3 + others }, 2000)
      // By a tag.
      var chip = named(tv, "taskTag_kopfsprung")
      waitForItemPolished(chip.parent)
      mouseClick(chip)
      compare(tv.list.map(function(t) { return t.t }), ["Order shirts"])
      // (The list shorter: the view scrolled back, a moment after.)
      wait(150)
      waitForItemPolished(named(tv, "taskTag_").parent)
      mouseClick(named(tv, "taskTag_"))
      compare(tv.list.length, 3 + others, "tag=" + tv.tag)
      // Ticked here: on its page, and gone from the list.
      var box = all(tv, function(it) { return it.objectName === "taskCheck" })[0]
      wait(150)
      mouseClick(box)
      tryVerify(function() { return Workspace.flatten(fileOf(p.id)).some(function(b) { return b.html.indexOf("Call the venue") === 0 && b.checked }) }, 2000)
      tryVerify(function() { return mine(tv.list).length === 2 }, 2000)
      // A page opened: not shown any more.
      view.open(p.id)
      tryVerify(function() { return view.page !== null && !view.tasksShown }, 2000)
      // Back: Tasks again.
      view.back()
      tryVerify(function() { return view.tasksShown }, 2000)
    }

    function test_2_found_as_the_pages_are_first_read() {
      fresh()
      var p = plans()
      ws.index.pages[p.id].tasks = null
      delete ws.texts[p.id]
      ws.written = ({})
      ws.scanTexts()
      tryVerify(function() { return ws.index.pages[p.id].tasks !== null }, 3000)
      compare(ws.index.pages[p.id].tasks.length, 3)
    }

    function test_3_on_the_calendar_and_from_a_terminal() {
      fresh()
      var p = plans()
      view.openCalendar("", false)
      tryVerify(function() { return view.calendarView.notes.some(function(n) { return n.kind === "task" && n.title === "Book the bus" }) }, 2000)
      var r = JSON.parse(api.tasks("")).filter(function(x) { return x.page === p.id })
      compare(r.map(function(x) { return x.text }), ["Call the venue", "Book the bus", "Order shirts"])
      compare(r[0].bucket, "overdue")
      compare(r[1].priority, 1)
      compare(r[2].tags, ["kopfsprung"])
      compare(JSON.parse(api.tasks("#kopfsprung")).length, 1)
      compare(JSON.parse(api.tasks("no way!")).ok, false)
    }
  }
}
