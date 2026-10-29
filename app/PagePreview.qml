import QtQuick
import QtQuick.Controls
import "../Workspace.js" as Workspace
import "../Query.js" as Query
import "../Lang.js" as Lang

// [fork] A look at a page, under a link to it the pointer rests on (in a
// line, or a page's or a link's block), as Notion and Trilium show one: its
// icon and title, where it is, the start of its text, its tags and when it
// changed. It comes after a moment (hoverAt) and goes a moment after the
// pointer leaves the link (unless it's over the look itself); a click on it
// opens the page.
Pop {
  id: pop

  property var workspace: null
  // The page it's of, and the one waiting to be (the pointer just came).
  property string pageId: ""
  property string waiting: ""
  property var anchorItem: null
  property real ax: 0
  property real ay: 0
  property string body: ""

  signal openRequested(string id)

  width: 360
  padding: 12
  focus: false
  closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

  readonly property var entry: { var r = workspace ? workspace.revision : 0; return workspace && pageId ? workspace.index.pages[pageId] || null : null }

  // The pointer on a link to page `id` ("" for none any more), at x, y in `anchor`.
  function hoverAt(id, anchor, x, y) {
    if (!id) {
      waiting = ""
      showTimer.stop()
      if (opened) hideTimer.restart()
      return
    }
    if (opened && id === pageId) { hideTimer.stop(); return }
    waiting = id
    anchorItem = anchor
    ax = x
    ay = y
    showTimer.restart()
  }

  Timer { id: showTimer; interval: 550; onTriggered: pop.show() }
  Timer { id: hideTimer; interval: 260; onTriggered: if (!inside.hovered) pop.close() }

  function show() {
    var id = waiting
    if (!id || !workspace || !workspace.index.pages[id] || !anchorItem || !parent) return
    pageId = id
    body = ""
    var text = workspace.texts[id]
    if (text !== undefined) body = bodyOf(text)
    else workspace.readPage(id, function(p) { if (p && pop.pageId === id) pop.body = pop.bodyOf(Workspace.pageText(p)) })
    var p = anchorItem.mapToItem(parent, ax, ay)
    x = Math.max(8, Math.min(parent.width - width - 8, p.x - 40))
    // Below the line, or above it when there's no room below.
    var below = p.y + 22
    y = below + 240 < parent.height ? below : Math.max(8, p.y - 12 - implicitHeight)
    hideTimer.stop()
    open()
  }

  // Its text without its title, in a few lines.
  function bodyOf(text) {
    var s = String(text || "")
    var nl = s.indexOf("\n")
    s = nl >= 0 ? s.slice(nl + 1) : ""
    s = s.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim()
    return s.length > 420 ? s.slice(0, 419) + "…" : s
  }

  onClosed: { pageId = ""; hideTimer.stop() }

  contentItem: Column {
    spacing: 6
    HoverHandler { id: inside; onHoveredChanged: if (!hovered && pop.opened) hideTimer.restart(); else hideTimer.stop() }
    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: { var id = pop.pageId; pop.close(); if (id) pop.openRequested(id) } }

    Row {
      width: parent.width
      spacing: 8
      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: pop.entry && pop.entry.icon ? pop.entry.icon : "\u{1f4c4}"
        font.family: "Noto Color Emoji"
        font.pixelSize: 18
      }
      Text {
        anchors.verticalCenter: parent.verticalCenter
        width: parent.width - 34
        elide: Text.ElideRight
        textFormat: Text.PlainText
        text: pop.entry ? (pop.entry.title || Lang.t("Untitled")) : ""
        font.family: pop.theme.uiFont
        font.pixelSize: 15
        font.weight: Font.DemiBold
        color: pop.theme.text
      }
    }
    Text {
      readonly property string where: pop.entry && pop.workspace ? Query.cell(pop.workspace.index, pop.pageId, "path", null) : ""
      visible: where !== ""
      width: parent.width
      elide: Text.ElideMiddle
      textFormat: Text.PlainText
      text: where
      font.family: pop.theme.uiFont
      font.pixelSize: 11
      color: pop.theme.faint
    }
    Text {
      width: parent.width
      maximumLineCount: 8
      wrapMode: Text.Wrap
      elide: Text.ElideRight
      textFormat: Text.PlainText
      text: pop.body !== "" ? pop.body : Lang.t("Nothing written on it yet")
      font.family: pop.theme.uiFont
      font.pixelSize: 13
      font.italic: pop.body === ""
      lineHeight: 1.15
      color: pop.body !== "" ? pop.theme.text : pop.theme.faint
    }
    Text {
      readonly property string tags: pop.entry && pop.workspace ? Query.cell(pop.workspace.index, pop.pageId, "tags", null) : ""
      readonly property string status: pop.entry && pop.entry.project && pop.workspace ? Lang.t(Query.cell(pop.workspace.index, pop.pageId, "status", null)) : ""
      width: parent.width
      elide: Text.ElideRight
      textFormat: Text.PlainText
      text: [status, tags, pop.entry && pop.workspace ? Lang.t("Changed: ") + Lang.t(Query.cell(pop.workspace.index, pop.pageId, "modified", new Date())) : ""].filter(function(x) { return x }).join("  ·  ")
      font.family: pop.theme.uiFont
      font.pixelSize: 11
      color: pop.theme.muted
    }
  }
}
