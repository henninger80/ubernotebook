import QtQuick
import QtQuick.Controls
import "../Tabs.js" as Tabs

// (fork) The tabs above the page (Tabs.js): a click goes to one, the middle
// button or its × closes it, + opens a new one (on what's shown), and one's
// dragged to another place. Shown while there's more than one, or always
// in the pane beside the first (DocView.paneName "split").
Item {
  id: strip

  property var theme: null
  property var view: null
  readonly property bool shown: view !== null && (view.tabs.length > 1 || view.paneName === "split")
  readonly property var pages: { var r = view && view.workspace ? view.workspace.revision : 0; return view && view.workspace ? view.workspace.index.pages : ({}) }
  readonly property var ids: { var r = view ? view.revision : 0; return view ? Tabs.shown(view.tabs, view.tabAt, view.history, view.historyAt) : [] }

  height: shown ? 36 : 0
  visible: shown
  clip: true

  Rectangle {
    anchors.fill: parent
    color: strip.theme.sidebar
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: strip.theme.line }
  }

  Flickable {
    id: scroller
    x: 6
    width: parent.width - x - plus.width - 10
    height: parent.height
    contentWidth: row.width
    contentHeight: height
    flickableDirection: Flickable.HorizontalFlick
    boundsBehavior: Flickable.StopAtBounds
    interactive: contentWidth > width
    clip: true

    Row {
      id: row
      height: parent.height
      spacing: 2
      Repeater {
        model: strip.ids
        delegate: Item {
          id: tab
          required property var modelData
          required property int index
          readonly property bool current: index === strip.view.tabAt
          readonly property var info: Tabs.label(modelData, strip.pages, function(n) { return "#" + n })
          width: Math.max(90, Math.min(200, name.implicitWidth + 50))
          height: row.height

          Rectangle {
            anchors.fill: parent
            anchors.topMargin: 5
            radius: 7
            color: tab.current ? strip.theme.background : tabHover.hovered ? strip.theme.hover : "transparent"
            border.width: tab.current ? 1 : 0
            border.color: strip.theme.line
            // (The current one runs into the page under it.)
            Rectangle {
              visible: tab.current
              anchors.bottom: parent.bottom
              x: 1; width: parent.width - 2; height: 8
              color: strip.theme.background
            }
          }
          Text {
            id: name
            textFormat: Text.PlainText
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            anchors.verticalCenterOffset: 2
            width: parent.width - x - 28
            elide: Text.ElideRight
            text: (tab.info.icon ? tab.info.icon + " " : "") + tab.info.title
            font.family: strip.theme.uiFont
            font.pixelSize: 12
            font.weight: tab.current ? Font.DemiBold : Font.Normal
            color: tab.current ? strip.theme.text : strip.theme.muted
          }
          IconButton {
            anchors.right: parent.right
            anchors.rightMargin: 4
            anchors.verticalCenter: parent.verticalCenter
            anchors.verticalCenterOffset: 2
            visible: (tab.current || tabHover.hovered) && (strip.ids.length > 1 || strip.view.paneName === "split")
            theme: strip.theme; icon: strip.theme.icons.close; size: 20; iconSize: 12; tint: strip.theme.muted
            tip: strip.ids.length > 1 ? "Close the tab  Ctrl+W" : "Close this pane  Ctrl+W"
            onClicked: strip.view.closeTab(tab.index)
          }
          HoverHandler { id: tabHover; cursorShape: Qt.PointingHandCursor }
          TapHandler { onTapped: strip.view.switchTab(tab.index) }
          TapHandler { acceptedButtons: Qt.MiddleButton; onTapped: strip.view.closeTab(tab.index) }
          // Dragged sideways: put where it's let go.
          DragHandler {
            id: drag
            target: null
            yAxis.enabled: false
            onActiveChanged: {
              if (active) return
              var to = Math.max(0, Math.min(strip.ids.length - 1, tab.index + Math.round(drag.activeTranslation.x / tab.width)))
              if (to !== tab.index) strip.view.moveTab(tab.index, to)
            }
          }
          ToolTip {
            visible: tabHover.hovered && name.truncated && !drag.active
            delay: 650
            y: parent.height + 4
            padding: 6
            contentItem: Text {
              textFormat: Text.PlainText
              text: name.text
              font.family: strip.theme.uiFont
              font.pixelSize: 12
              color: strip.theme.text
            }
            background: Rectangle { radius: 7; color: strip.theme.surfaceHigh; border.width: 1; border.color: strip.theme.line }
          }
        }
      }
    }
  }

  IconButton {
    id: plus
    anchors.right: parent.right
    anchors.rightMargin: 6
    anchors.verticalCenter: parent.verticalCenter
    anchors.verticalCenterOffset: 2
    theme: strip.theme; icon: strip.theme.icons.plus; size: 26; iconSize: 14
    tip: "A new tab  Ctrl+T"
    onClicked: strip.view.newTab("")
  }
}
