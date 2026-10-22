import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"
import "../../Workspace.js" as Workspace

// (fork) The pages inside a page sorted from its ⋯ menu in the sidebar
// (PageSort.js): the rows in that order, the way kept on its entry, the
// page's own blocks where they were.
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
    name: "PageSort"
    when: windowShown

    function fresh() {
      files.reset()
      view.page = null
      ws.welcomed = false
      ws.written = ({})
      ws.load()
      tryCompare(ws, "ready", true, 2000)
      view.activate()
      tryVerify(function() { return view.page !== null }, 2000)
      wait(0)
    }
    function find(item, test, out) {
      if (!item) return out
      if (item.visible && test(item)) out.push(item)
      for (var i = 0; i < item.children.length; i++) find(item.children[i], test, out)
      return out
    }
    function named(name) { return find(root.Window.window.contentItem, function(it) { return it.objectName === name }, [])[0] || null }
    function makePage(title, parent) {
      var p = ws.createPage({ parent: parent || "", title: title })
      if (parent) ws.editPage(parent, function(x) { return Workspace.appendPageBlock(x, p.id) })
      return p
    }
    function rowTitles() {
      return find(named("sidebar"), function(it) { return it.objectName === "pageRow" && it.modelData }, [])
        .sort(function(x, y) { return x.mapToItem(root, 0, 0).y - y.mapToItem(root, 0, 0).y })
        .map(function(r) { return r.modelData.title })
    }
    function rowOf(title) {
      var r = null
      tryVerify(function() { r = find(named("sidebar"), function(it) { return it.objectName === "pageRow" && it.modelData && it.modelData.title === title }, [])[0] || null; return r !== null }, 1000, title)
      return r
    }
    function choose(pageId, title, choice) {
      view.openRowMenu(pageId, rowOf(title))
      tryVerify(function() { return named("rowSort") !== null }, 1000)
      wait(100)
      mouseClick(named("rowSort"))
      tryVerify(function() { return named(choice) !== null }, 1000)
      wait(100)
      mouseClick(named(choice))
    }

    function test_1_sorted_from_its_menu() {
      fresh()
      var p = makePage("Projects", "")
      makePage("Zebra", p.id)
      makePage("apple", p.id)
      makePage("Mango", p.id)
      view.toggleRow(p.id)
      tryVerify(function() { var t = rowTitles(); return t.indexOf("Mango") > t.indexOf("apple") && t.indexOf("apple") > t.indexOf("Zebra") }, 2000, "as on the page")
      choose(p.id, "Projects", "rowSort_title")
      tryCompare(ws.index.pages[p.id], "sort", "title", 1000)
      tryVerify(function() { var t = rowTitles(); return t.indexOf("apple") < t.indexOf("Mango") && t.indexOf("Mango") < t.indexOf("Zebra") }, 2000, "by name")
      tryVerify(function() { return named("rowSortChoices") === null }, 1000, "the menu's closed")
      compare(ws.index.pages[p.id].children.map(function(c) { return ws.index.pages[c].title }), ["Zebra", "apple", "Mango"], "the page as it was")
      choose(p.id, "Projects", "rowSort_manual")
      tryCompare(ws.index.pages[p.id], "sort", "", 1000)
      tryVerify(function() { var t = rowTitles(); return t.indexOf("Zebra") < t.indexOf("apple") }, 2000, "as on the page again")
    }

    function test_2_not_for_a_page_without_pages_in_it() {
      fresh()
      var p = makePage("Alone", "")
      view.openRowMenu(p.id, rowOf("Alone"))
      tryVerify(function() { return named("rowArchive") !== null }, 1000)
      verify(named("rowSort") === null)
      keyClick(Qt.Key_Escape)
    }
  }
}
