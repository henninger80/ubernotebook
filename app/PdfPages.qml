import QtQuick
import QtQuick.Controls
import QtQuick.Pdf
import "../Lang.js" as Lang  // [fork] German

// A PDF's pages, one under another, with the page you're on: what fills a
// PDF's frame in FileBlock. Loaded only there, so without QtQuick.Pdf (it
// comes with qt6-webengine) only a PDF's pages don't show, not Pages.
Item {
  id: pp

  property url source
  property bool showing: false
  // Not shown: too big, or not a plain file (FileBlock's pdfOk is 0).
  property bool refused: false
  property string family: ""
  property color faint: "gray"
  readonly property int pageCount: doc.pageCount

  PdfDocument {
    id: doc
    source: pp.source
  }
  ListView {
    id: pages
    objectName: "pdfPages"
    anchors.fill: parent
    anchors.margins: 8
    spacing: 8
    clip: true
    model: pp.showing ? doc.pageCount : 0
    boundsBehavior: Flickable.StopAtBounds
    ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
    delegate: Item {
      required property int index
      readonly property size pt: doc.pagePointSize(index)
      width: pages.width
      height: pt.width > 0 ? pages.width * pt.height / pt.width : pages.width * 1.3
      Rectangle { anchors.fill: parent; color: "white" }
      PdfPageImage {
        anchors.fill: parent
        document: doc
        currentFrame: index
        asynchronous: true
        fillMode: Image.PreserveAspectFit
        sourceSize.width: Math.round(pages.width * 1.5)
      }
    }
  }
  Rectangle {
    visible: doc.pageCount > 0
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    anchors.margins: 12
    width: pageLabel.implicitWidth + 16
    height: 24
    radius: 12
    color: Qt.rgba(0, 0, 0, 0.55)
    Text {
      id: pageLabel
      anchors.centerIn: parent
      textFormat: Text.PlainText
      readonly property int at: { var i = pages.indexAt(10, pages.contentY + pages.height / 3); return i < 0 ? 1 : i + 1 }
      text: at + " / " + doc.pageCount
      font.family: pp.family
      font.pixelSize: 11
      color: "white"
    }
  }
  Text {
    visible: doc.status === PdfDocument.Error || pp.refused
    anchors.centerIn: parent
    width: Math.min(implicitWidth, parent.width - 40)
    wrapMode: Text.Wrap
    horizontalAlignment: Text.AlignHCenter
    textFormat: Text.PlainText
    text: pp.refused ? Lang.t("Too big to show here (over 200 MB, or not a plain file): Open opens it in its app") : Lang.t("The PDF couldn't be read")
    font.family: pp.family
    font.pixelSize: 13
    color: pp.faint
  }
}
