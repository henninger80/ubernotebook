import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"
import "../../Workspace.js" as Workspace

// [fork] What's made quicker for typing (docs/performance.md): the tree
// written once writing pauses when only pages' times changed (soon for
// anything else, and as the shell stops), the Library and the calendar not
// worked out while they're hidden, and every page's text read in small lots.
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

  TestCase {
    name: "Perf"
    when: windowShown

    function indexOnDisk() { return JSON.parse(files.disk[Workspace.indexFile(files.rootPath)] || "{\"pages\":{}}") }
    function fresh() {
      files.reset()
      view.libraryShown = false
      view.page = null
      view.tagShown = ""
      view.history = []
      view.historyAt = -1
      ws.welcomed = false
      ws.written = ({})
      ws.load()
      tryCompare(ws, "ready", true, 2000)
      view.activate()
      tryVerify(function() { return view.page !== null }, 2000)
      ws.flush()
    }

    function test_1_the_tree_written_once_writing_pauses() {
      fresh()
      var page = ws.createPage({ parent: "", title: "Notes", blocks: [{ type: "p", html: "one", indent: 0 }] })
      wait(400)
      compare(indexOnDisk().pages[page.id].title, "Notes", "a new page: soon")
      // Only its text: not after 0.3 s.
      var p = ws.readPageNow(page.id)
      p.blocks[Object.keys(p.blocks)[0]].html = "one two"
      p.modified = "2026-10-17T10:00:00.000Z"
      ws.savePage(p)
      wait(600)
      verify(indexOnDisk().pages[page.id].modified !== "2026-10-17T10:00:00.000Z", "its time waits")
      // As the shell stops: written.
      ws.flush()
      compare(indexOnDisk().pages[page.id].modified, "2026-10-17T10:00:00.000Z", "written as it stops")
      // A time, then its title: both soon.
      p.modified = "2026-10-17T11:00:00.000Z"
      ws.savePage(p)
      p.title = "Notes 2"
      ws.savePage(p)
      wait(400)
      compare(indexOnDisk().pages[page.id].title, "Notes 2")
      compare(indexOnDisk().pages[page.id].modified, "2026-10-17T11:00:00.000Z")
      // Its title, then only a time: still soon (the time doesn't put it off).
      p.title = "Notes 3"
      ws.savePage(p)
      p.modified = "2026-10-17T12:00:00.000Z"
      ws.savePage(p)
      wait(400)
      compare(indexOnDisk().pages[page.id].title, "Notes 3")
      // Only times, one after another: written once they stop.
      p.modified = "2026-10-17T13:00:00.000Z"
      ws.savePage(p)
      wait(5300)
      compare(indexOnDisk().pages[page.id].modified, "2026-10-17T13:00:00.000Z", "after the pause")
    }

    function test_2_hidden_views_not_worked_out() {
      fresh()
      ws.createPage({ parent: "", title: "Links", blocks: [{ type: "p", html: "<a href=\"https://example.com/a\">a</a>", indent: 0 }] })
      verify(!view.libraryView.visible)
      compare(view.libraryView.all.length, 0, "hidden: nothing worked out")
      view.openLibrary("")
      tryVerify(function() { return view.libraryView.visible && view.libraryView.all.length === 1 }, 2000, "shown: there")
      verify(!view.calendarView.visible)
      compare(view.calendarView.notes.length, 0)
    }

    function test_3_every_pages_text_read() {
      fresh()
      var ids = []
      for (var i = 0; i < 65; i++) ids.push(ws.createPage({ parent: "", title: "Page " + i, blocks: [{ type: "p", html: "word" + i, indent: 0 }] }).id)
      ws.flush()
      // Read again, as at a start.
      ws.texts = ({})
      ws.written = ({})
      ws.readJson = ({})
      ws.scanTexts()
      tryVerify(function() { return ids.every(function(id) { return ws.texts[id] !== undefined }) }, 5000, "every page's text, in lots")
      verify(ws.texts[ids[64]].indexOf("word64") >= 0)
    }
  }
}
