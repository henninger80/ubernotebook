import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"
import "../../Workspace.js" as Workspace

// [fork] The query block (QueryBlock.qml, Query.js): the pages inside a page
// as a table, a page's status changed from it, a new page in there; a search
// kept on a page as a list. The pages naming a page without a link
// (MentionsBar.qml), one linked. A look at a page under a link to it
// (PagePreview.qml).
Item {
  id: root
  width: 1320
  height: 900

  FakeFiles { id: files }
  FakeService { id: service; user: ({ sounds: false }) }
  Theme { id: th }
  UberNotebook.Workspace { id: ws; files: files }
  DocView { id: view; anchors.fill: parent; theme: th; workspace: ws; service: service }

  TestCase {
    name: "Query"
    when: windowShown

    function fresh() {
      files.reset()
      view.page = null
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
    function count(name) { return all(view, function(it) { return it.objectName === name }).length }
    function fileOf(id) { return files.parseJson(files.disk[Workspace.pageFile(files.rootPath, id)] || "") }
    function tag(n) { return "<a href=\"uber-notebook://tag/" + n + "\">#" + n + "</a>" }

    // A page with two pages inside it (on it as page blocks), and a block.
    function projects(block) {
      var top = ws.createPage({ parent: "", title: "Projekte", blocks: [block, { type: "p", html: "", indent: 0 }] })
      var a = ws.createPage({ parent: top.id, title: "Vereinsfest", project: { status: "active", due: "" }, blocks: [{ type: "p", html: "Aufbau " + tag("verein"), indent: 0 }] })
      var b = ws.createPage({ parent: top.id, title: "Website", blocks: [{ type: "p", html: "Relaunch", indent: 0 }] })
      var done = false
      ws.editPage(top.id, function(p) { Workspace.appendPageBlock(p, a.id); Workspace.appendPageBlock(p, b.id) }, function() { done = true })
      tryVerify(function() { return done }, 2000)
      return { top: top.id, a: a.id, b: b.id }
    }

    function test_1_the_pages_inside_as_a_table() {
      fresh()
      var w = projects({ type: "query", data: { scope: "here", view: "table" }, indent: 0 })
      view.open(w.top)
      tryVerify(function() { return view.page && view.page.id === w.top }, 2000)
      tryVerify(function() { return count("queryTableRow") === 2 }, 3000, "both pages inside, as rows")
      // A page's status, from its cell.
      var uid = ""
      for (var i = 0; i < view.editor.model.count; i++) if (view.editor.model.get(i).type === "query") uid = view.editor.model.get(i).uid
      verify(uid !== "")
      view.dataAction(uid, "setStatus", { page: w.b, status: "paused" })
      tryVerify(function() { var f = fileOf(w.b); return f && f.project && f.project.status === "paused" }, 2000, "the page is a project now, paused")
      // A new page in there: on this page after the others, opened.
      view.dataAction(uid, "newPage", w.top)
      tryVerify(function() { return ws.index.pages[w.top].children.length === 3 }, 2000, "a third page inside")
      tryVerify(function() { return view.page && view.page.id === ws.index.pages[w.top].children[2] }, 2000, "it's opened")
    }

    function test_2_a_search_as_a_list() {
      fresh()
      var w = projects({ type: "p", html: "", indent: 0 })
      var q = ws.createPage({ parent: "", title: "Suche", blocks: [{ type: "query", data: { q: "#verein" }, indent: 0 }] })
      view.open(q.id)
      tryVerify(function() { return count("queryRow") === 1 }, 3000, "the tagged page only")
      // Changed: found again.
      var uid = view.editor.model.get(0).uid
      view.editor.setData(uid, { q: "Relaunch OR Website" })
      view.editor.setData(uid, { q: "Website" })
      tryVerify(function() { return count("queryRow") === 1 && named(view, "queryRow").e.title === "Website" }, 3000)
    }

    function test_3_named_without_a_link() {
      fresh()
      var g = ws.createPage({ parent: "", title: "Gelsensport", blocks: [{ type: "p", html: "Der Verein", indent: 0 }] })
      var s = ws.createPage({ parent: "", title: "Sitzung", blocks: [{ type: "p", html: "Mit gelsensport über die Halle", indent: 0 }] })
      view.open(g.id)
      tryVerify(function() { return named(view, "mentionsToggle") !== null }, 3000, "one page names it")
      mouseClick(named(view, "mentionsToggle"))
      tryVerify(function() { return named(view, "mentionLink") !== null }, 2000)
      mouseClick(named(view, "mentionLink"))
      tryVerify(function() { var f = fileOf(s.id); return f && JSON.stringify(f).indexOf("uber-notebook://page/" + g.id) >= 0 }, 2000, "linked there")
      tryVerify(function() { return named(view, "mentionsToggle") === null }, 3000, "and it's linked from, now")
      compare(Workspace.backlinks(ws.index, g.id).length, 1)
    }

    function test_4_a_look_at_a_page() {
      fresh()
      var g = ws.createPage({ parent: "", title: "Gelsensport", blocks: [{ type: "p", html: "Der Verein aus Gelsenkirchen", indent: 0 }] })
      var s = ws.createPage({ parent: "", title: "Sitzung", blocks: [{ type: "p", html: "Mit <a href=\"uber-notebook://page/" + g.id + "\">Gelsensport</a>", indent: 0 }] })
      view.open(s.id)
      tryVerify(function() { return view.page && view.page.id === s.id }, 2000)
      var pv = view.pagePreview
      view.editor.pageHovered(g.id, view.editor, 20, 20)
      tryCompare(pv, "opened", true, 2000)
      compare(pv.pageId, g.id)
      verify(pv.body.indexOf("Gelsenkirchen") >= 0)
      view.editor.pageHovered("", view.editor, 0, 0)
      tryCompare(pv, "opened", false, 2000)
    }
  }
}
