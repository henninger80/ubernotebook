import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"
import "../../Workspace.js" as Workspace
import "../../Tags.js" as Tags

// [fork] A tag's view with its ticked to-dos hidden and shown again.
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
    name: "TagDone"
    when: windowShown

    function find(item, test) {
      if (!item) return null
      if (item.visible && test(item)) return item
      for (var i = 0; i < item.children.length; i++) {
        var hit = find(item.children[i], test)
        if (hit) return hit
      }
      return null
    }
    function all(item, test, out) {
      if (!item) return out
      if (item.visible && test(item)) out.push(item)
      for (var i = 0; i < item.children.length; i++) all(item.children[i], test, out)
      return out
    }
    function named(item, name) { return find(item, function(it) { return it.objectName === name }) }
    function rows() { return all(view.tagView, function(it) { return it.objectName === "tagged" }, []) }

    function test_1_done_hidden_and_shown() {
      files.reset()
      ws.load()
      tryCompare(ws, "ready", true, 2000)
      view.activate()
      tryVerify(function() { return view.page !== null }, 2000)
      ws.createPage({ parent: "", title: "Errands", blocks: [
        { type: "check", html: "milk " + Tags.html("todo"), checked: true, indent: 0 },
        { type: "check", html: "post " + Tags.html("todo"), checked: false, indent: 0 },
        { type: "p", html: "a note " + Tags.html("todo"), indent: 0 }] })
      ws.createPage({ parent: "", title: "Done page", blocks: [
        { type: "check", html: "tax " + Tags.html("todo"), checked: true, indent: 0 }] })
      view.openFromTag(Tags.href("todo"))
      tryCompare(view, "tagShown", "todo", 1000)
      tryVerify(function() { return rows().length === 4 }, 2000, "all four shown")
      var tv = view.tagView
      compare(tv.doneCount, 2)
      compare(tv.hideDone, false)

      // (The button shows up once a to-do is ticked: its row laid out again first.)
      waitForItemPolished(named(tv, "tagHideDone").parent)
      mouseClick(named(tv, "tagHideDone"))
      tryCompare(tv, "hideDone", true, 1000)
      tryVerify(function() { return rows().length === 2 }, 1000, "the open to-do and the note")
      compare(tv.shown.length, 1, "the page with only done ones left out")
      compare(tv.shown[0].title, "Errands")

      // Ticking the last open one: everything done.
      var post = rows().filter(function(r) { return r.modelData.type === "check" })[0]
      tv.toggle(tv.shown[0].id, post.modelData.uid, true)
      tryVerify(function() { return rows().length === 1 }, 2000, "only the note")

      mouseClick(named(tv, "tagHideDone"))
      tryVerify(function() { return rows().length === 4 }, 1000, "shown again")
    }
  }
}
