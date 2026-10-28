import QtQuick
import "../Lang.js" as Lang  // [fork] German

// The foot of Pages' sidebar, and the shelf's corner: when there's a newer
// Uber Notebook, a line that says so (a click: what's new in it, and updating);
// just updated, a line that says so once (a click: Settings → What's new; ×
// puts it away); then who made Uber Notebook, on X (a click opens the
// profile in your browser).
Column {
  id: sf

  property var theme: null
  property var service: null
  signal notesRequested()
  signal whatsNewRequested()

  readonly property string handle: "devsec_ai"
  readonly property string profileUrl: "https://x.com/" + handle
  readonly property var updates: service && service.updates ? service.updates : null
  readonly property bool updateShown: updates !== null && updates.available

  spacing: 2

  // A newer version.
  Rectangle {
    id: updateLine
    objectName: "footerUpdate"
    visible: sf.updateShown
    width: parent.width
    height: 30
    radius: 6
    color: updateHover.hovered ? sf.theme.hover : "transparent"
    Rectangle {
      x: 12
      anchors.verticalCenter: parent.verticalCenter
      width: 7
      height: 7
      radius: 3.5
      color: sf.theme.accent
    }
    Text {
      x: 30
      width: parent.width - 40
      anchors.verticalCenter: parent.verticalCenter
      elide: Text.ElideRight
      textFormat: Text.PlainText
      text: sf.updates && sf.updates.latest ? Lang.t("Version ") + sf.updates.latest.version + Lang.t(" is available") : ""
      font.family: sf.theme.uiFont
      font.pixelSize: 12
      font.weight: Font.Medium
      color: sf.theme.text
    }
    HoverHandler { id: updateHover; cursorShape: Qt.PointingHandCursor }
    TapHandler { onTapped: sf.notesRequested() }
  }

  // Just updated.
  Rectangle {
    id: updatedLine
    objectName: "footerUpdated"
    visible: !sf.updateShown && sf.service !== null && sf.service.justUpdated === true
    width: parent.width
    height: 30
    radius: 6
    color: updatedHover.hovered ? sf.theme.hover : "transparent"
    HoverHandler { id: updatedHover }
    // (The words open What's new; × beside them only puts the line away.)
    Item {
      width: parent.width - updatedClose.width - 4
      height: parent.height
      Rectangle {
        x: 12
        anchors.verticalCenter: parent.verticalCenter
        width: 7
        height: 7
        radius: 3.5
        color: sf.theme.accent
      }
      Text {
        x: 30
        width: parent.width - 34
        anchors.verticalCenter: parent.verticalCenter
        elide: Text.ElideRight
        textFormat: Text.PlainText
        text: sf.service ? Lang.t("Updated to ") + sf.service.version + Lang.t(" \u00b7 What's new") : ""
        font.family: sf.theme.uiFont
        font.pixelSize: 12
        font.weight: Font.Medium
        color: sf.theme.text
      }
      HoverHandler { cursorShape: Qt.PointingHandCursor }
      TapHandler { onTapped: { sf.service.updateSeen(); sf.whatsNewRequested() } }
    }
    IconButton {
      id: updatedClose
      objectName: "footerUpdatedClose"
      anchors.right: parent.right
      anchors.rightMargin: 2
      anchors.verticalCenter: parent.verticalCenter
      theme: sf.theme
      icon: sf.theme.icons.close
      size: 24
      iconSize: 12
      tint: sf.theme.muted
      tip: Lang.t("Dismiss")
      onClicked: sf.service.updateSeen()
    }
  }

  // On X: there to see, quietly (brighter under the pointer).
  Rectangle {
    id: xLine
    objectName: "footerX"
    width: parent.width
    height: 24
    radius: 6
    color: xHover.hovered ? sf.theme.hover : "transparent"
    Row {
      x: 12
      anchors.verticalCenter: parent.verticalCenter
      spacing: 6
      XLogo {
        anchors.verticalCenter: parent.verticalCenter
        size: 10
        color: xHover.hovered ? sf.theme.text : sf.theme.faint
      }
      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: Lang.t("Follow me on X")
        font.family: sf.theme.uiFont
        font.pixelSize: 11
        color: xHover.hovered ? sf.theme.muted : sf.theme.faint
      }
      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: "@" + sf.handle
        font.family: sf.theme.uiFont
        font.pixelSize: 11
        font.underline: xHover.hovered
        color: xHover.hovered ? sf.theme.text : sf.theme.muted
      }
    }
    HoverHandler { id: xHover; cursorShape: Qt.PointingHandCursor }
    TapHandler { onTapped: if (sf.service && sf.service.store) sf.service.store.openUrl(sf.profileUrl) }
  }
}
