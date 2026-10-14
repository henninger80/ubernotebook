import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"
import "../qml"

// Without QtQuick.Pdf (it comes with qt6-webengine, which Omarchy doesn't
// install): Pages still opens, and a PDF on a page is a file like any other,
// with Open and no Show pages. tests/run hides the module for this one
// (bwrap, a folder over /usr/lib/qt6/qml/QtQuick/Pdf).
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
    name: "NoPdf"
    when: windowShown

    function find(item, test) {
      if (!item) return null
      if (test(item)) return item
      for (var i = 0; i < item.children.length; i++) {
        var hit = find(item.children[i], test)
        if (hit) return hit
      }
      return null
    }
    function named(name) { return find(view, function(it) { return it.objectName === name }) }

    function test_pages_opens_and_a_pdf_is_a_file() {
      verify(Qt.createComponent(Qt.resolvedUrl("../../app/PdfPages.qml")).status === Component.Error, "QtQuick.Pdf is hidden for this test")
      ws.load()
      tryCompare(ws, "ready", true, 2000)
      view.activate()
      tryVerify(function() { return view.page !== null }, 2000)
      view.editor.readOnly = false
      view.editor.load([{ type: "file", indent: 0, data: { src: "assets/file-20261002-120000-abc-x.pdf", name: "X.pdf", size: 2048, kind: "pdf", open: true } }])
      waitForRendering(view)
      tryVerify(function() { var n = named("fileName"); return n !== null && n.visible && n.text === "X.pdf" }, 2000)
      verify(named("fileOpen").visible, "Open is there")
      verify(!named("filePages").visible, "no Show pages")
      verify(!named("pdfFrame").visible, "no frame for its pages, even if it was open")
    }
  }
}
