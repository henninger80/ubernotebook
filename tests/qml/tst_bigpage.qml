import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"
import "../../Workspace.js" as Workspace

// A big page open in the window (as long as a meeting's transcript: over a
// thousand blocks): a command that changes only its cover, icon or title
// shows the change without drawing every block again or scrolling back to
// the top; one that changes its blocks still shows them.
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

  QtObject {
    id: ui
    function saveNow() { view.commit() }
    function appendToOpenPage(id, blocks) { return view.appendFromCommand(id, blocks) }
    function addPageBlock(parentId, childId) { return view.pageAddedInto(parentId, childId) }
    function replaceInOpenPage(id, change) { return view.replaceFromCommand(id, change) }
    function insertInOpenPage(id, change) { return view.insertFromCommand(id, change) }
    function trashPage(id) { view.trashPage(id); return true }
    function askAgentPermission(req) { return view.askAgentPermission(req) }
  }

  UberNotebook.Api { id: api; workspace: ws; files: files; ui: ui }

  TestCase {
    name: "BigPage"
    when: windowShown

    function json(text) { return JSON.parse(text) }

    function test_header_changes_on_a_big_open_page() {
      files.reset()
      view.page = null
      ws.welcomed = false
      ws.written = ({})
      ws.load()
      tryCompare(ws, "ready", true, 2000)
      ws.ensureStarted()
      var lines = ["# Sunday", ""]
      for (var i = 0; i < 1100; i++) lines.push("- **Speaker " + (i % 5) + ":** " + new Array(40).join("words said in the meeting ") + i)
      files.disk["/tmp/in/big.md"] = lines.join("\n")
      var r = json(api.add("Big", "/tmp/in/big.md"))
      verify(r.ok, JSON.stringify(r))
      view.open(r.id)
      tryVerify(function() { return view.page !== null && view.page.id === r.id && view.editor.model.count > 1000 }, 20000)
      wait(50)
      view.flick.contentY = 4000
      var loads = view.editor.loads
      var y = view.flick.contentY

      var t0 = Date.now()
      compare(json(api.cover(r.id, "gradient:3")).ok, true)
      var answered = Date.now() - t0
      tryCompare(view, "cover", "gradient:3", 5000)
      console.log("bigpage: cover answered in " + answered + " ms, shown in " + (Date.now() - t0) + " ms")
      compare(view.editor.loads, loads, "the blocks aren't drawn again")
      compare(view.flick.contentY, y, "where you were on the page")

      compare(json(api.icon(r.id, "🎙️")).ok, true)
      tryCompare(view, "icon", "🎙️", 5000)
      compare(json(api.rename(r.id, "Sunday, edited")).ok, true)
      tryVerify(function() { return view.page.title === "Sunday, edited" && view.pageTitleText() === "Sunday, edited" }, 5000)
      compare(view.editor.loads, loads, "nor for the icon and the title")
      compare(view.flick.contentY, y)

      // A change to its blocks still shows them.
      files.disk["/tmp/in/more.md"] = "A line at the end"
      compare(json(api.append(r.id, "/tmp/in/more.md")).ok, true)
      tryVerify(function() { return view.editor.serialize().some(function(b) { return String(b.html || "").indexOf("A line at the end") >= 0 }) }, 5000)
    }
  }
}
