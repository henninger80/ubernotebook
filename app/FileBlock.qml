import QtQuick
import "../Files.js" as Files
import "../Lang.js" as Lang  // [fork] German

// A file on a page in Pages: what it is, what it's called and how big, and
// Open (in the app it opens in). A PDF shows its pages here too, one under
// another (Show pages / Hide), in a frame whose bottom edge drags to make
// it taller or shorter, with the page you're on (PdfPages.qml: without
// QtQuick.Pdf, from qt6-webengine, a PDF is a file like any other). Not added
// yet, it asks for one. Its colors are Pages' or your own.
DataCard {
  id: fb
  kind: "file"

  readonly property bool has: info.src !== ""
  readonly property bool pdf: has && info.kind === "pdf"
  // Its pages can show (QtQuick.Pdf is there).
  readonly property bool pdfView: pdf && pdfLoader.status === Loader.Ready
  readonly property bool showing: pdfView && info.open
  readonly property int pageCount: pdfView ? pdfLoader.item.pageCount : 0
  readonly property string url: has && editor ? editor.assetUrl(info.src) : ""
  // A PDF's pages are shown only from a plain file of at most maxPdf bytes,
  // as it really is (not as the page says): 1 yes, 0 no, -1 asking.
  readonly property real maxPdf: 200 * 1024 * 1024
  property int pdfOk: -1
  onUrlChanged: checkPdf()
  Component.onCompleted: checkPdf()
  function checkPdf() {
    pdfOk = -1
    if (!pdf || !editor) return
    var src = info.src
    editor.assetInfo(src, function(r) {
      if (src !== fb.info.src) return
      fb.pdfOk = r !== null && r.regular && r.size <= fb.maxPdf ? 1 : 0
    })
  }
  function sample() { return info.name || "File" }

  readonly property string glyph: {
    if (!theme) return ""
    var k = info.kind
    var i = theme.icons
    return k === "pdf" ? i.pdf : k === "video" ? i.video : k === "audio" ? i.fileMusic : k === "image" ? i.fileImage : k === "doc" ? i.fileDoc
      : k === "sheet" ? i.fileSheet : k === "slides" ? i.fileSlides : k === "archive" ? i.fileZip : k === "code" ? i.fileCode : i.attach
  }

  // The frame's height as it's dragged (not kept yet), or -1.
  property real dragH: -1
  readonly property real frameH: dragH >= 0 ? dragH : info.height

  width: available
  height: card.height

  Rectangle {
    id: card
    width: fb.width
    height: head.height + (fb.showing ? frame.height + 10 : 0)
    radius: 10
    color: fb.fill
    border.width: 1
    border.color: Qt.alpha(fb.words, fb.pointerIn ? 0.14 : 0.08)

    Item {
      id: head
      width: parent.width
      height: 54
      Rectangle {
        id: badge
        x: 10
        anchors.verticalCenter: parent.verticalCenter
        width: 36
        height: 36
        radius: 8
        color: Qt.alpha(fb.accent, 0.14)
        Text {
          anchors.centerIn: parent
          textFormat: Text.PlainText
          text: fb.has ? fb.glyph : (fb.theme ? fb.theme.icons.attach : "")
          font.family: fb.theme ? fb.theme.iconFont : ""
          font.pixelSize: 19
          color: fb.accent
        }
      }
      Column {
        x: badge.x + badge.width + 12
        anchors.verticalCenter: parent.verticalCenter
        width: tools.x - x - 8
        spacing: 1
        Text {
          objectName: "fileName"
          width: parent.width
          elide: Text.ElideMiddle
          textFormat: Text.PlainText
          text: fb.has ? fb.info.name || Lang.t("File") : (fb.readOnly ? Lang.t("A file, not added") : fb.info.kind === "pdf" ? Lang.t("Add a PDF") : Lang.t("Add a file"))
          font.family: fb.editor ? fb.editor.uiFamily : ""
          font.pixelSize: 14
          font.weight: fb.has ? Font.DemiBold : Font.Normal
          color: fb.has ? fb.words : fb.faint
        }
        Text {
          width: parent.width
          elide: Text.ElideRight
          textFormat: Text.PlainText
          text: fb.has ? (fb.info.kind === "other" ? "" : fb.info.kind.toUpperCase() + "  \u00b7  ") + Files.sizeLabel(fb.info.size) + (fb.pageCount > 0 ? "  \u00b7  " + fb.pageCount + (fb.pageCount === 1 ? Lang.t(" page") : Lang.t(" pages")) : "")
            : "Click to pick one, or drop a file on the page"
          font.family: fb.editor ? fb.editor.uiFamily : ""
          font.pixelSize: 12
          color: fb.faint
        }
      }
      Row {
        id: tools
        anchors.right: parent.right
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        spacing: 2
        IconButton {
          objectName: "filePages"
          visible: fb.pdfView
          theme: fb.theme; icon: fb.theme ? fb.theme.icons.pdf : ""; label: fb.info.open ? Lang.t("Hide pages") : Lang.t("Show pages"); size: 30; iconSize: 14; tint: fb.words
          onClicked: fb.change({ open: !fb.info.open })
        }
        IconButton {
          objectName: "fileOpen"
          visible: fb.has
          theme: fb.theme; icon: fb.theme ? fb.theme.icons.openExternal : ""; label: Lang.t("Open"); size: 30; iconSize: 14; tint: fb.words
          tip: Lang.t("Open it in its app")
          onClicked: fb.act("open", null)
        }
        IconButton {
          id: colorButton
          objectName: "fileColors"
          visible: !fb.readOnly && (fb.pointerIn || fb.trying !== null)
          theme: fb.theme; icon: fb.theme ? fb.theme.icons.palette : ""; size: 30; iconSize: 14; tint: fb.words
          tip: Lang.t("Its colors")
          onClicked: fb.askColors(colorButton)
        }
      }
      HoverHandler { cursorShape: fb.has ? Qt.ArrowCursor : Qt.PointingHandCursor }
      TapHandler {
        enabled: !fb.has && !fb.readOnly
        onTapped: fb.act("pick", null)
      }
    }

    // A PDF's pages.
    Rectangle {
      id: frame
      objectName: "pdfFrame"
      visible: fb.showing
      x: 10
      y: head.height
      width: parent.width - 20
      height: fb.frameH
      radius: 6
      color: fb.dark ? "#2a2b33" : "#d9d6cf"
      clip: true
      Loader {
        id: pdfLoader
        anchors.fill: parent
        active: fb.pdf
        source: "PdfPages.qml"
      }
      Binding { target: pdfLoader.item; property: "source"; value: fb.pdf && fb.pdfOk === 1 ? fb.url : ""; when: pdfLoader.status === Loader.Ready }
      Binding { target: pdfLoader.item; property: "showing"; value: fb.showing; when: pdfLoader.status === Loader.Ready }
      Binding { target: pdfLoader.item; property: "refused"; value: fb.pdfOk === 0; when: pdfLoader.status === Loader.Ready }
      Binding { target: pdfLoader.item; property: "family"; value: fb.editor ? fb.editor.uiFamily : ""; when: pdfLoader.status === Loader.Ready }
      Binding { target: pdfLoader.item; property: "faint"; value: fb.faint; when: pdfLoader.status === Loader.Ready }
      // Its bottom edge: taller or shorter.
      Item {
        objectName: "pdfEdge"
        anchors.bottom: parent.bottom
        width: parent.width
        height: 8
        visible: !fb.readOnly
        HoverHandler { cursorShape: Qt.SizeVerCursor }
        DragHandler {
          target: null
          property real from: 0
          onActiveChanged: {
            if (active) { from = fb.info.height; fb.dragH = from }
            else { var h = Math.round(fb.dragH); fb.dragH = -1; if (h !== fb.info.height) fb.change({ height: h }) }
          }
          onTranslationChanged: if (active) fb.dragH = Math.max(200, Math.min(2000, from + translation.y))
        }
      }
    }
  }
}
