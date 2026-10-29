import QtQuick
import QtQuick.Controls
import "../Mentions.js" as Mentions
import "../Search.js" as Search
import "../Lang.js" as Lang

// [fork] Under a page's "Linked from": the pages that name it without a
// link to it (Mentions.js), as a line that opens to a list: each with the
// words around where it's named; Link makes the first place there a link to
// this page (that page's version kept first), Link all does it on each. A
// click on a page opens it.
Column {
  id: bar

  property var theme: null
  property var workspace: null
  property string pageId: ""
  property bool expanded: false
  property var found: []

  signal openRequested(string id)
  signal pageHovered(string id, var anchor, real x, real y)

  visible: found.length > 0
  spacing: 2
  topPadding: 4

  function refresh() {
    if (!workspace || !pageId || !workspace.index.pages[pageId]) { found = []; return }
    found = Mentions.find(workspace.index, workspace.texts, pageId, 60)
  }
  onPageIdChanged: { expanded = false; found = []; later.restart() }
  // (Looked for a moment after a page opens, or the notes change.)
  Timer { id: later; interval: 600; onTriggered: bar.refresh() }
  Connections {
    target: bar.workspace
    function onRevisionChanged() { later.restart() }
  }

  // The first place on page `id` naming this one made a link.
  function link(id, done) {
    var e = workspace.index.pages[pageId]
    if (!e) { if (done) done(false); return }
    var title = e.title
    var target = pageId
    workspace.keepVersion(id, "link", true)
    workspace.editPage(id, function(p) {
      if (p.format && p.format.locked) return false
      return Mentions.linkOnPage(p, title, target)
    }, function(ok) { if (done) done(ok) })
  }
  function linkAll() {
    var ids = found.map(function(m) { return m.id })
    var i = 0
    function next() { if (i < ids.length) bar.link(ids[i++], next) }
    next()
  }

  Row {
    spacing: 8
    height: 26
    Text {
      objectName: "mentionsToggle"
      anchors.verticalCenter: parent.verticalCenter
      textFormat: Text.PlainText
      text: (bar.expanded ? "▾ " : "▸ ") + (bar.found.length === 1 ? Lang.t("Named on 1 page without a link") : Lang.t("Named on ") + bar.found.length + Lang.t(" pages without a link"))
      font.family: bar.theme ? bar.theme.uiFont : ""
      font.pixelSize: 12
      font.underline: toggleHover.hovered
      color: bar.theme ? bar.theme.muted : "gray"
      HoverHandler { id: toggleHover; cursorShape: Qt.PointingHandCursor }
      TapHandler { onTapped: bar.expanded = !bar.expanded }
    }
    Text {
      objectName: "mentionsLinkAll"
      visible: bar.expanded && bar.found.length > 1
      anchors.verticalCenter: parent.verticalCenter
      textFormat: Text.PlainText
      text: Lang.t("Link all")
      font.family: bar.theme ? bar.theme.uiFont : ""
      font.pixelSize: 12
      font.underline: allHover.hovered
      color: bar.theme ? bar.theme.accent : "blue"
      HoverHandler { id: allHover; cursorShape: Qt.PointingHandCursor }
      TapHandler { onTapped: bar.linkAll() }
    }
  }

  Repeater {
    model: bar.expanded ? bar.found : []
    delegate: Rectangle {
      id: row
      required property var modelData
      objectName: "mentionRow"
      readonly property var e: bar.workspace ? bar.workspace.index.pages[modelData.id] || null : null
      readonly property var snip: e ? Search.snippet(bar.workspace.texts[modelData.id], e.title, modelData.at, modelData.length, 46) : null
      width: bar.width
      height: e ? 44 : 0
      visible: e !== null
      radius: 6
      color: rowHover.hovered ? (bar.theme ? bar.theme.hover : "transparent") : "transparent"
      HoverHandler { id: rowHover }
      Column {
        x: 8
        anchors.verticalCenter: parent.verticalCenter
        width: parent.width - linkButton.width - 24
        Text {
          id: name
          width: parent.width
          elide: Text.ElideRight
          textFormat: Text.PlainText
          text: row.e ? (row.e.icon ? row.e.icon + " " : "") + (row.e.title || Lang.t("Untitled")) + (row.modelData.count > 1 ? "  ×" + row.modelData.count : "") : ""
          font.family: bar.theme ? bar.theme.uiFont : ""
          font.pixelSize: 13
          font.underline: nameHover.hovered
          color: bar.theme ? bar.theme.text : "black"
          HoverHandler {
            id: nameHover
            cursorShape: Qt.PointingHandCursor
            onHoveredChanged: bar.pageHovered(hovered ? row.modelData.id : "", name, 0, name.height)
          }
          TapHandler { onTapped: bar.openRequested(row.modelData.id) }
        }
        Text {
          width: parent.width
          elide: Text.ElideRight
          textFormat: Text.StyledText
          text: row.snip ? bar.esc(row.snip.before) + "<b>" + bar.esc(row.snip.match) + "</b>" + bar.esc(row.snip.after) : ""
          font.family: bar.theme ? bar.theme.uiFont : ""
          font.pixelSize: 12
          color: bar.theme ? bar.theme.faint : "gray"
        }
      }
      TextButton {
        id: linkButton
        objectName: "mentionLink"
        anchors.right: parent.right
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        theme: bar.theme
        text: Lang.t("Link")
        onClicked: bar.link(row.modelData.id, null)
      }
    }
  }

  function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }
}
