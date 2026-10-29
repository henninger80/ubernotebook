import QtQuick
import QtQuick.Controls
import "../Query.js" as Query
import "../Search.js" as Search
import "../Workspace.js" as Workspace
import "../Lang.js" as Lang

// [fork] A query block on a page in Pages (/query, /database; Query.js):
// the pages a search finds, found again as your notes change, as a list
// (each with the words it was found by) or as a table (a database view: its
// columns a page's status, due date, tags, to-dos, when it changed...). A
// click opens a page; a table's column heading sorts by it, a status cell
// changes the page's status. Its bar (on hover): the query and where it
// looks (Edit), list or table, how it's sorted; inside a page, New page
// puts one in there.
DataCard {
  id: qb
  kind: "query"

  readonly property var ws: editor ? editor.calendarSource : null
  readonly property string here: editor ? editor.pageId : ""
  readonly property bool table: info.view === "table"
  property var result: ({ rows: [], total: 0, bad: [], scope: "" })
  property bool editing: false
  // The page whose status is being changed (the status menu's).
  property string statusFor: ""
  // What it says above its pages, without a heading of its own.
  function sample() {
    if (info.title) return info.title
    if (info.scope === "here") return Lang.t("Pages inside this page")
    if (info.scope !== "all") { var e = ws ? ws.index.pages[info.scope] : null; return Lang.t("Inside ") + (e ? e.title || Lang.t("Untitled") : Lang.t("a page")) }
    return info.q ? info.q : Lang.t("Every page")
  }
  function focusQuery() { startEditing() }

  function refresh() {
    if (!ws || !ws.index) return
    result = Query.run(ws.index, ws.texts, info, here, new Date())
  }
  onLoaded: later.restart()
  onHereChanged: later.restart()
  onWsChanged: later.restart()
  Component.onCompleted: later.restart()
  // (Found again a moment after the notes change, not at each keystroke.)
  Timer { id: later; interval: 350; onTriggered: qb.refresh() }
  Connections {
    target: qb.ws
    function onRevisionChanged() { later.restart() }
    // (Not the page it's on being written as you type on it: its own
    // words are never among what it shows.)
    function onSaved(id) { if (id !== qb.here) later.restart() }
    function onPageChanged(id) { later.restart() }
  }

  function startEditing() {
    if (readOnly) return
    editing = true
    qField.text = info.q
    tField.text = info.title
    Qt.callLater(function() { qField.focusField() })
  }
  function apply() {
    editing = false
    change({ q: qField.text.trim(), title: tField.text.trim() })
  }
  function sortBy(col) {
    if (readOnly) return
    var s = col === "title" ? "title" : col === "path" ? "" : col
    if (!s || ["title", "modified", "created", "due", "status"].indexOf(s) < 0) return
    if (info.sort === s) change({ desc: !info.desc })
    else change({ sort: s, desc: false })
  }
  function toggleCol(col) {
    var cols = info.cols.slice()
    var i = cols.indexOf(col)
    if (i >= 0) cols.splice(i, 1)
    else {
      // (In the order they're offered.)
      cols.push(col)
      var order = Query.COLUMNS.map(function(c) { return c.id })
      cols.sort(function(a, b) { return order.indexOf(a) - order.indexOf(b) })
    }
    change({ cols: cols })
  }

  readonly property real colW: 104
  function widthOf(col) { return col === "tags" ? 150 : col === "path" ? 170 : col === "progress" ? 70 : col === "status" ? 96 : qb.colW }
  readonly property real colsW: { var w = 0; for (var i = 0; i < info.cols.length; i++) w += widthOf(info.cols[i]); return w }
  readonly property real titleW: Math.max(160, width - 24 - colsW)
  readonly property string font: editor ? editor.uiFamily : ""

  width: available
  height: card.height

  Rectangle {
    id: card
    width: qb.width
    height: col.height + 20
    radius: 10
    color: qb.look.background ? qb.fill : "transparent"
    border.width: 1
    border.color: Qt.alpha(qb.words, qb.pointerIn || qb.editing ? 0.16 : 0.09)

    Column {
      id: col
      x: 12
      y: 10
      width: parent.width - 24
      spacing: 6

      // What it shows, and how many.
      Item {
        width: parent.width
        height: 28
        Row {
          anchors.verticalCenter: parent.verticalCenter
          spacing: 8
          width: parent.width - tools.width - 8
          Text {
            anchors.verticalCenter: parent.verticalCenter
            textFormat: Text.PlainText
            text: qb.theme ? (qb.table ? qb.theme.icons.table : qb.theme.icons.search) : ""
            font.family: qb.theme ? qb.theme.iconFont : ""
            font.pixelSize: 16
            color: qb.accent
          }
          Text {
            id: heading
            anchors.verticalCenter: parent.verticalCenter
            width: Math.min(implicitWidth, parent.width - 120)
            elide: Text.ElideRight
            textFormat: Text.PlainText
            text: qb.sample()
            font.family: qb.font
            font.pixelSize: 14
            font.weight: Font.DemiBold
            color: qb.words
          }
          Text {
            anchors.verticalCenter: parent.verticalCenter
            textFormat: Text.PlainText
            text: qb.result.total === 1 ? Lang.t("1 page") : qb.result.total + Lang.t(" pages")
            font.family: qb.font
            font.pixelSize: 12
            color: qb.faint
          }
        }
        Row {
          id: tools
          objectName: "queryTools"
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          spacing: 2
          visible: !qb.readOnly && (qb.pointerIn || sortMenu.opened || moreMenu.opened || qb.editing)
          IconButton { objectName: "queryNew"; visible: qb.result.scope !== ""; theme: qb.theme; icon: qb.theme ? qb.theme.icons.plus : ""; size: 26; iconSize: 14; tint: qb.words; tip: Lang.t("A new page in there"); onClicked: qb.act("newPage", qb.result.scope) }
          IconButton { objectName: "queryEdit"; theme: qb.theme; icon: qb.theme ? qb.theme.icons.edit : ""; size: 26; iconSize: 13; tint: qb.words; tip: Lang.t("What it looks for"); onClicked: qb.editing ? qb.apply() : qb.startEditing() }
          IconButton { objectName: "queryView"; theme: qb.theme; icon: qb.theme ? (qb.table ? qb.theme.icons.bullets : qb.theme.icons.table) : ""; size: 26; iconSize: 14; tint: qb.words; tip: qb.table ? Lang.t("Show as a list") : Lang.t("Show as a table"); onClicked: qb.change({ view: qb.table ? "list" : "table" }) }
          IconButton {
            id: sortButton
            objectName: "querySort"
            theme: qb.theme; icon: qb.theme ? qb.theme.icons.swap : ""; size: 26; iconSize: 14; tint: qb.words; tip: Lang.t("Sort")
            onClicked: sortMenu.open()
            Pop {
              id: sortMenu
              theme: qb.theme
              focus: false
              width: 220
              y: sortButton.height + 4
              x: sortButton.width - width
              contentItem: Column {
                spacing: 2
                Repeater {
                  model: [
                    { id: "auto", label: "Best first" }, { id: "order", label: "As they are in the page" },
                    { id: "title", label: "By name" }, { id: "modified", label: "Last changed" },
                    { id: "created", label: "Last made" }, { id: "due", label: "By due date" }, { id: "status", label: "By status" }
                  ]
                  delegate: MenuRow {
                    required property var modelData
                    width: parent.width
                    theme: qb.theme
                    text: Lang.t(modelData.label)
                    checked: qb.info.sort === modelData.id
                    active: modelData.id !== "order" || qb.result.scope !== ""
                    onClicked: { sortMenu.close(); qb.change({ sort: modelData.id, desc: false }) }
                  }
                }
                MenuRow { width: parent.width; theme: qb.theme; icon: qb.theme ? qb.theme.icons.swap : ""; text: Lang.t("The other way round"); checked: qb.info.desc; onClicked: { sortMenu.close(); qb.change({ desc: !qb.info.desc }) } }
              }
            }
          }
          IconButton {
            id: moreButton
            objectName: "queryMore"
            theme: qb.theme; icon: qb.theme ? qb.theme.icons.tune : ""; size: 26; iconSize: 14; tint: qb.words; tip: Lang.t("Where it looks, its columns, its colors")
            onClicked: moreMenu.open()
            Pop {
              id: moreMenu
              theme: qb.theme
              focus: false
              width: 250
              y: moreButton.height + 4
              x: moreButton.width - width
              contentItem: Column {
                spacing: 2
                MenuRow { width: parent.width; theme: qb.theme; icon: qb.theme ? qb.theme.icons.search : ""; text: Lang.t("Every page"); checked: qb.info.scope === "all"; onClicked: { moreMenu.close(); qb.change({ scope: "all" }) } }
                MenuRow { width: parent.width; theme: qb.theme; icon: qb.theme ? qb.theme.icons.page : ""; text: Lang.t("The pages inside this page"); checked: qb.info.scope === "here"; onClicked: { moreMenu.close(); qb.change({ scope: "here" }) } }
                MenuRow {
                  width: parent.width; theme: qb.theme; icon: qb.theme ? qb.theme.icons.tree : ""
                  text: qb.info.scope !== "all" && qb.info.scope !== "here" ? Lang.t("Inside ") + ((qb.ws && qb.ws.index.pages[qb.info.scope] && qb.ws.index.pages[qb.info.scope].title) || Lang.t("Untitled")) : Lang.t("Inside another page…")
                  checked: qb.info.scope !== "all" && qb.info.scope !== "here"
                  onClicked: { moreMenu.close(); qb.act("pickScope", null) }
                }
                MenuRow { width: parent.width; theme: qb.theme; icon: qb.theme ? qb.theme.icons.indent : ""; text: Lang.t("And the pages inside those"); checked: qb.info.deep; active: qb.info.scope !== "all"; onClicked: { moreMenu.close(); qb.change({ deep: !qb.info.deep }) } }
                Rectangle { width: parent.width; height: 1; color: qb.theme ? qb.theme.line : "gray"; visible: qb.table }
                Text { visible: qb.table; leftPadding: 8; topPadding: 4; textFormat: Text.PlainText; text: Lang.t("Columns"); font.family: qb.font; font.pixelSize: 11; color: qb.theme ? qb.theme.muted : "gray" }
                Repeater {
                  model: qb.table ? Query.COLUMNS : []
                  delegate: MenuRow {
                    required property var modelData
                    width: parent.width
                    theme: qb.theme
                    text: Lang.t(modelData.label)
                    checked: qb.info.cols.indexOf(modelData.id) >= 0
                    onClicked: qb.toggleCol(modelData.id)
                  }
                }
                Rectangle { width: parent.width; height: 1; color: qb.theme ? qb.theme.line : "gray" }
                MenuRow { width: parent.width; theme: qb.theme; icon: qb.theme ? qb.theme.icons.palette : ""; text: Lang.t("Color…"); onClicked: { moreMenu.close(); qb.askColors(moreButton) } }
              }
            }
          }
        }
      }

      // What it looks for, changed.
      Column {
        visible: qb.editing
        width: parent.width
        spacing: 6
        Field {
          id: qField
          objectName: "queryField"
          theme: qb.theme
          width: parent.width
          height: 34
          icon: qb.theme ? qb.theme.icons.search : ""
          maximumLength: 500
          placeholder: Lang.t("Words, #tags, status:active, is:project, changed:7d, due:14d, in:Page")
          onAccepted: qb.apply()
          onEscaped: qb.editing = false
        }
        Field {
          id: tField
          objectName: "queryTitle"
          theme: qb.theme
          width: parent.width
          height: 30
          fontSize: 13
          maximumLength: 120
          placeholder: Lang.t("A heading for it (optional)")
          onAccepted: qb.apply()
          onEscaped: qb.editing = false
        }
        Text {
          width: parent.width
          wrapMode: Text.Wrap
          textFormat: Text.PlainText
          text: Lang.t("Words are found as Ctrl+P finds them. -#tag and -is:project leave pages out. Enter keeps it, Esc leaves it as it was.")
          font.family: qb.font
          font.pixelSize: 11
          color: qb.faint
        }
      }

      Text {
        visible: qb.result.bad.length > 0
        width: parent.width
        wrapMode: Text.Wrap
        textFormat: Text.PlainText
        text: Lang.t("Not understood: ") + qb.result.bad.join("  ")
        font.family: qb.font
        font.pixelSize: 12
        color: qb.theme ? qb.theme.urgent : "red"
      }

      Text {
        visible: qb.result.total === 0
        width: parent.width
        topPadding: 2
        bottomPadding: 2
        wrapMode: Text.Wrap
        textFormat: Text.PlainText
        text: qb.info.scope === "here" ? Lang.t("No pages inside this page yet") : !qb.info.q && qb.info.scope === "all" ? Lang.t("Every page shows here: say what to look for (Edit)") : Lang.t("No pages found")
        font.family: qb.font
        font.pixelSize: 13
        font.italic: true
        color: qb.faint
      }

      // ---- as a list ----
      Column {
        visible: !qb.table
        width: parent.width
        Repeater {
          model: qb.table ? [] : qb.result.rows
          delegate: Rectangle {
            id: row
            required property var modelData
            objectName: "queryRow"
            readonly property var e: qb.ws ? qb.ws.index.pages[modelData.id] || null : null
            readonly property var snip: modelData.at >= 0 && qb.ws ? Search.snippet(qb.ws.texts[modelData.id], e ? e.title : "", modelData.at, modelData.length, 50) : null
            visible: e !== null
            width: parent.width
            height: e ? lines.height + 10 : 0
            radius: 6
            color: rowHover.hovered ? Qt.alpha(qb.words, 0.06) : "transparent"
            Column {
              id: lines
              x: 6
              y: 5
              width: parent.width - 12
              Item {
                width: parent.width
                height: 22
                Text {
                  anchors.verticalCenter: parent.verticalCenter
                  width: parent.width - when.width - 10
                  elide: Text.ElideRight
                  textFormat: Text.PlainText
                  text: row.e ? (row.e.icon ? row.e.icon + "  " : "\u{1f4c4}  ") + (row.e.title || Lang.t("Untitled")) : ""
                  font.family: qb.font
                  font.pixelSize: 14
                  color: qb.words
                }
                Text {
                  id: when
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  textFormat: Text.PlainText
                  text: row.e ? Lang.t(Query.cell(qb.ws.index, row.modelData.id, row.e.project && qb.info.sort === "due" ? "due" : "modified", new Date())) : ""
                  font.family: qb.font
                  font.pixelSize: 11
                  color: qb.faint
                }
              }
              Text {
                visible: text !== ""
                leftPadding: 26
                width: parent.width
                elide: Text.ElideRight
                textFormat: Text.StyledText
                text: row.snip ? qb.esc(row.snip.before) + "<b>" + qb.esc(row.snip.match) + "</b>" + qb.esc(row.snip.after)
                  : row.e && qb.ws && qb.result.scope === "" ? qb.esc(Query.cell(qb.ws.index, row.modelData.id, "path", null)) : ""
                font.family: qb.font
                font.pixelSize: 12
                color: qb.faint
              }
            }
            HoverHandler { id: rowHover; cursorShape: Qt.PointingHandCursor }
            TapHandler { onTapped: if (qb.editor) qb.editor.pageOpened(row.modelData.id) }
          }
        }
      }

      // ---- as a table ----
      Column {
        visible: qb.table && qb.result.total > 0
        width: parent.width
        clip: true
        // Its headings: a click sorts by it.
        Row {
          height: 28
          Repeater {
            model: qb.table ? ["title"].concat(qb.info.cols) : []
            delegate: Item {
              id: head
              required property var modelData
              readonly property bool sorted: qb.info.sort === modelData
              width: modelData === "title" ? qb.titleW : qb.widthOf(modelData)
              height: 28
              Text {
                x: 6
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - 12
                elide: Text.ElideRight
                textFormat: Text.PlainText
                text: (head.modelData === "title" ? Lang.t("Name") : Lang.t(Query.COLUMNS.filter(function(c) { return c.id === head.modelData })[0].label)) + (head.sorted ? (qb.info.desc ? "  ↓" : "  ↑") : "")
                font.family: qb.font
                font.pixelSize: 12
                font.weight: Font.DemiBold
                color: head.sorted ? qb.accent : qb.faint
              }
              HoverHandler { cursorShape: head.modelData !== "path" && head.modelData !== "tags" && head.modelData !== "progress" ? Qt.PointingHandCursor : Qt.ArrowCursor }
              TapHandler { onTapped: qb.sortBy(head.modelData) }
            }
          }
        }
        Rectangle { width: parent.width; height: 1; color: Qt.alpha(qb.words, 0.12) }
        Repeater {
          model: qb.table ? qb.result.rows : []
          delegate: Rectangle {
            id: trow
            required property var modelData
            required property int index
            objectName: "queryTableRow"
            readonly property var e: qb.ws ? qb.ws.index.pages[modelData.id] || null : null
            width: col.width
            height: e ? 32 : 0
            visible: e !== null
            color: trowHover.hovered ? Qt.alpha(qb.words, 0.05) : "transparent"
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Qt.alpha(qb.words, 0.06) }
            HoverHandler { id: trowHover }
            Row {
              height: parent.height
              Item {
                width: qb.titleW
                height: parent.height
                Text {
                  x: 6
                  anchors.verticalCenter: parent.verticalCenter
                  width: parent.width - 12
                  elide: Text.ElideRight
                  textFormat: Text.PlainText
                  text: trow.e ? (trow.e.icon ? trow.e.icon + "  " : "\u{1f4c4}  ") + (trow.e.title || Lang.t("Untitled")) : ""
                  font.family: qb.font
                  font.pixelSize: 14
                  font.underline: nameHover.hovered
                  color: qb.words
                }
                HoverHandler { id: nameHover; cursorShape: Qt.PointingHandCursor }
                TapHandler { onTapped: if (qb.editor) qb.editor.pageOpened(trow.modelData.id) }
              }
              Repeater {
                model: qb.info.cols
                delegate: Item {
                  id: cellItem
                  required property var modelData
                  readonly property string value: trow.e && qb.ws ? Query.cell(qb.ws.index, trow.modelData.id, modelData, new Date()) : ""
                  readonly property bool isStatus: modelData === "status"
                  width: qb.widthOf(modelData)
                  height: trow.height
                  // A status as a pill (a click changes it); the rest as words.
                  Rectangle {
                    visible: cellItem.isStatus && cellItem.value !== ""
                    x: 6
                    anchors.verticalCenter: parent.verticalCenter
                    width: Math.min(parent.width - 12, pill.implicitWidth + 16)
                    height: 22
                    radius: 11
                    color: Qt.alpha(qb.statusColor(trow.e), 0.18)
                    Text { id: pill; anchors.centerIn: parent; textFormat: Text.PlainText; text: Lang.t(cellItem.value); font.family: qb.font; font.pixelSize: 12; color: qb.words }
                  }
                  Text {
                    visible: !cellItem.isStatus || (cellItem.value === "" && statusHover.hovered && !qb.readOnly)
                    x: 6
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - 12
                    elide: Text.ElideRight
                    textFormat: Text.PlainText
                    text: cellItem.isStatus ? Lang.t("Set…") : Lang.t(cellItem.value)
                    font.family: qb.font
                    font.pixelSize: 12
                    color: cellItem.modelData === "due" && trow.e && trow.e.project && trow.e.project.due && qb.overdue(trow.e) ? (qb.theme ? qb.theme.urgent : "red") : qb.faint
                  }
                  HoverHandler { id: statusHover; enabled: cellItem.isStatus; cursorShape: cellItem.isStatus && !qb.readOnly ? Qt.PointingHandCursor : Qt.ArrowCursor }
                  TapHandler {
                    enabled: cellItem.isStatus && !qb.readOnly
                    onTapped: { qb.statusFor = trow.modelData.id; statusMenu.parent = cellItem; statusMenu.y = cellItem.height; statusMenu.open() }
                  }
                }
              }
            }
          }
        }
      }

      // More of them.
      Text {
        objectName: "queryMoreRows"
        visible: qb.result.total > qb.result.rows.length
        leftPadding: 6
        textFormat: Text.PlainText
        text: Lang.t("Show more") + "  (" + (qb.result.total - qb.result.rows.length) + Lang.t(" more)")
        font.family: qb.font
        font.pixelSize: 12
        font.underline: moreRowsHover.hovered
        color: qb.accent
        HoverHandler { id: moreRowsHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { onTapped: qb.change({ limit: Math.min(200, qb.info.limit + 25) }) }
      }
    }
  }

  // A page's status, from its status cell.
  Pop {
    id: statusMenu
    theme: qb.theme
    focus: false
    width: 180
    contentItem: Column {
      spacing: 2
      Repeater {
        model: Workspace.STATUSES
        delegate: MenuRow {
          required property var modelData
          width: parent.width
          theme: qb.theme
          text: Lang.t(modelData.label)
          checked: { var e = qb.ws && qb.statusFor ? qb.ws.index.pages[qb.statusFor] : null; return !!(e && e.project && e.project.status === modelData.id) }
          onClicked: { statusMenu.close(); qb.act("setStatus", { page: qb.statusFor, status: modelData.id }) }
        }
      }
      MenuRow { width: parent.width; theme: qb.theme; text: Lang.t("Not a project"); onClicked: { statusMenu.close(); qb.act("setStatus", { page: qb.statusFor, status: "" }) } }
    }
  }

  function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }
  function overdue(e) { var i = Workspace.dueInfo(e.project.due, new Date()); return !!i && i.days < 0 && e.project.status !== "done" }
  function statusColor(e) {
    var s = e && e.project ? Workspace.statusOf(e.project.status).color : "gray"
    return s === "blue" ? "#2f6fd6" : s === "green" ? "#2e9d5b" : s === "yellow" ? "#d19a00" : "#8a8f98"
  }
}
