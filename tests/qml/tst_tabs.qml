import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"
import "../../Workspace.js" as Workspace
import "../../Html.js" as Html

// (fork) Tabs and the pane beside the first (Tabs.js, PageTabs.qml,
// SplitPane.qml): tabs opened, switched, closed and kept, each with its own
// back; a page beside, read only where it came last, shown as it changes.
Item {
  id: root
  width: 1400
  height: 900

  FakeFiles { id: files }
  FakeService { id: service; user: ({ sounds: false }) }
  Theme { id: th }

  UberNotebook.Workspace {
    id: ws
    files: files
  }

  DocView {
    id: view
    anchors.fill: parent
    anchors.rightMargin: split.width
    theme: th
    workspace: ws
    service: service
    onSplitRequested: function(id, then) { split.openBeside(id, then) }
    onSplitClosed: split.close()
  }

  SplitPane {
    id: split
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.bottom: parent.bottom
    theme: th
    workspace: ws
    service: service
    first: view
  }

  TestCase {
    name: "Tabs"
    when: windowShown

    function fresh() {
      split.close()
      files.reset()
      service.user = ({ sounds: false })
      view.page = null
      view.history = []
      view.historyAt = -1
      view.tabs = [{ history: [], at: -1 }]
      view.tabAt = 0
      view.tabsRestored = false
      ws.welcomed = false
      ws.written = ({})
      ws.load()
      tryCompare(ws, "ready", true, 2000)
      view.activate()
      tryVerify(function() { return view.page !== null }, 2000)
      wait(0)
    }
    function made(title) { var p = ws.createPage({ parent: "", title: title }); return p.id }
    function fileOf(id) { return files.parseJson(files.disk[Workspace.pageFile(files.rootPath, id)] || "") }

    function test_1_tabs_opened_switched_and_closed() {
      fresh()
      var home = view.page.id
      var a = made("A"), b = made("B")
      var strip = findChild(view, "pageTabs")
      verify(!strip.shown, "one tab: no strip")
      view.newTab(a)
      tryCompare(view.page, "id", a, 2000)
      compare(view.tabs.length, 2)
      compare(view.tabAt, 1)
      verify(strip.shown)
      view.open(b)
      tryCompare(view.page, "id", b, 2000)
      view.switchTab(0)
      tryCompare(view.page, "id", home, 2000)
      compare(view.historyAt, 0, "the first tab's own history")
      view.switchTab(1)
      tryCompare(view.page, "id", b, 2000)
      view.back()
      tryCompare(view.page, "id", a, 2000)
      view.closeTab(1)
      tryCompare(view.page, "id", home, 2000)
      compare(view.tabs.length, 1)
      view.closeTab(0)
      compare(view.tabs.length, 1, "the last tab stays")
    }

    function test_2_tabs_kept() {
      fresh()
      var a = made("A")
      view.newTab(a)
      tryCompare(view.page, "id", a, 2000)
      view.keepTabs()
      compare(service.settings.tabs.length, 2)
      compare(service.settings.tabs[1], a)
      compare(service.settings.tabAt, 1)
      // Next time: both again, on the one you were on.
      view.page = null
      view.history = []
      view.historyAt = -1
      view.tabs = [{ history: [], at: -1 }]
      view.tabAt = 0
      view.tabsRestored = false
      view.startShown = false
      view.activate()
      tryVerify(function() { return view.page && view.page.id === a }, 2000)
      compare(view.tabs.length, 2)
      compare(view.tabAt, 1)
    }

    function test_3_a_page_beside() {
      fresh()
      var home = view.page.id
      var a = made("A")
      view.openBeside(a)
      verify(split.shown)
      verify(split.pane !== null)
      compare(view.peer, split.pane)
      tryVerify(function() { return split.pane.page && split.pane.page.id === a }, 2000)
      compare(view.page.id, home, "the first pane stays where it was")
      verify(!view.mirrored && !split.pane.mirrored)
      compare(service.settings.lastPage, home, "the pane beside isn't where you were")
      // The same page in both: read only where it came last.
      split.pane.open(home)
      tryVerify(function() { return split.pane.page && split.pane.page.id === home }, 2000)
      verify(split.pane.mirrored)
      verify(split.pane.locked)
      verify(!view.mirrored)
      // Changed in the first: shown so beside it.
      var e = view.editor
      e.focusBlock(e.uidAt(0), 0)
      e.insertBlocksAt(0, [{ type: "p", html: "Written in the first", indent: 0 }], true)
      view.markDirty()
      view.commit()
      tryVerify(function() { return Html.plainText(split.pane.editor.blockAt(0).html) === "Written in the first" }, 2000)
      // Only read there: nothing written from it.
      split.pane.markDirty()
      verify(!split.pane.pageDirty)
      // The first goes elsewhere: the one beside can be changed again.
      view.open(a)
      tryCompare(view.page, "id", a, 2000)
      verify(!split.pane.mirrored)
      // A command for the page open beside: made there.
      verify(view.appendFromCommand(home, [{ type: "p", html: "From a command", indent: 0 }]) === true)
      verify(fileOf(home).content.some(function(uid) { return Html.plainText(fileOf(home).blocks[uid].html) === "From a command" }))
      // Closed: its tabs aren't kept, and the first is on its own again.
      split.close()
      verify(!split.shown)
      compare(view.peer, null)
      compare(service.settings.splitTabs.length, 0)
    }

    function test_4_the_last_tab_beside_closes_it() {
      fresh()
      view.toggleSplit()
      verify(split.shown)
      tryVerify(function() { return split.pane.page !== null }, 2000)
      compare(split.pane.page.id, view.page.id)
      verify(split.pane.mirrored, "what's shown, beside it: read there")
      split.pane.closeTab(0)
      verify(!split.shown)
    }
  }
}
