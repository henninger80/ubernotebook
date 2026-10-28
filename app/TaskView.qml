import QtQuick
import QtQuick.Controls
import "../Tasks.js" as Tasks
import "../Tabs.js" as Tabs
import "../Lang.js" as Lang  // [fork] German

// (fork) Tasks in Pages (the Tasks tile in the sidebar): every open to-do on
// your pages (Tasks.js), overdue first, then today's, the next 7 days',
// later and those with no date (folded to start with). Their status
// filters them (to do, in progress; or the ticked ones, done or cancelled,
// the last done first), and so do the tags they have most. A to-do ticks
// here (and can be unticked a moment after; a done one unticks); a click
// opens its page there, with Ctrl (or the middle button, or its tab
// button) in a new tab, with Ctrl+Shift (or its pane button) beside, in
// the other pane (Tabs.js). Read only while it's shown.
Item {
  id: tv

  property var theme: null
  property var workspace: null
  // DocView: opening pages and tags, how text is drawn, the toasts.
  property var view: null
  // The tag the tasks are filtered by ("" every one).
  property string tag: ""
  // Their status (Tasks.STATUSES): "open" every one not ticked.
  property string status: "open"
  readonly property bool closedShown: status === "done" || status === "cancelled"
  // (So many shown, the ticked ones: more a click away.)
  property int most: 100
  // The buckets folded: { none: true }.
  property var folded: ({ none: true })
  // The to-dos' words as written on their pages: { "<page>/<block>": html }.
  property var htmlOf: ({})
  property real nowMs: Date.now()

  readonly property var list: { var r = workspace ? workspace.revision : 0; return workspace && visible ? Tasks.forStatus(workspace.index, new Date(nowMs), tag, status) : [] }
  readonly property var everyTag: { var r = workspace ? workspace.revision : 0; return workspace && visible ? Tasks.topTags(Tasks.forStatus(workspace.index, new Date(nowMs), "", status), 7) : [] }
  // How many of each status (the chips say).
  readonly property var counts: {
    var r = workspace ? workspace.revision : 0
    if (!workspace || !visible) return ({})
    var open = Tasks.all(workspace.index, new Date(nowMs), tag), shut = Tasks.closed(workspace.index, tag)
    var out = { open: open.length }
    ;["todo", "doing"].forEach(function(k) { out[k] = Tasks.withStatus(open, k).length })
    out.done = Tasks.withStatus(shut, "done").length
    out.cancelled = Tasks.withStatus(shut, "cancelled").length + Tasks.withStatus(open, "cancelled").length
    return out
  }
  readonly property var groups: closedShown
    ? [{ id: "closed", label: status === "done" ? "Done" : "Cancelled", tasks: list.slice(0, most) }]
    : Tasks.buckets(list)
  readonly property int overdue: closedShown ? 0 : groups[0].tasks.length

  function red() { return theme && theme.dark ? "#ff6b6b" : "#d93f3f" }

  // The pages read (from memory, mostly) for the to-dos' words as written.
  function load() {
    if (!workspace || !visible) return
    var ids = []
    list.forEach(function(t) { if (ids.indexOf(t.page) < 0) ids.push(t.page) })
    workspace.readPages(ids, function(pages) {
      var m = {}
      pages.forEach(function(p) { for (var uid in p.blocks) { var b = p.blocks[uid]; if (b.type === "check") m[p.id + "/" + uid] = b.html || "" } })
      tv.htmlOf = m
    })
  }
  onVisibleChanged: if (visible) { nowMs = Date.now(); load() }
  onTagChanged: load()
  onStatusChanged: { most = 100; load() }

  // A task's page, on its to-do: here, in a new tab ("tab") or beside ("split").
  function openTask(t, how) {
    var then = { block: t.b }
    if (how === "tab") view.newTab(t.page, then)
    else if (how === "split") view.openBeside(t.page, then)
    else view.open(t.page, false, then)
  }
  Connections {
    target: tv.workspace
    function onRevisionChanged() { if (tv.visible) reloadTimer.restart() }
  }
  Timer { id: reloadTimer; interval: 250; onTriggered: tv.load() }
  // (A new day: the buckets again.)
  Timer { interval: 60000; repeat: true; running: tv.visible; onTriggered: tv.nowMs = Date.now() }

  // A to-do ticked here: on its page, a moment to take it back.
  function tick(pageId, uid, on, words) {
    workspace.editPage(pageId, function(page) {
      var b = page.blocks[uid]
      if (!b || b.type !== "check") return false
      b.checked = on
    })
    var w = words.length > 40 ? words.slice(0, 39) + "…" : words
    if (on && view) view.toastUndo(Lang.t("Done: ") + w, function() { tv.tick(pageId, uid, false, words) })
    else if (!on && view && tv.closedShown) view.toastUndo(Lang.t("Open again: ") + w, function() { tv.tick(pageId, uid, true, words) })
  }
  function fold(id) {
    var f = JSON.parse(JSON.stringify(folded))
    f[id] = !f[id]
    folded = f
  }

  Rectangle { anchors.fill: parent; color: tv.theme.background }

  Flickable {
    id: flick
    anchors.fill: parent
    contentWidth: width
    contentHeight: body.height + 120
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

    Column {
      id: body
      x: Math.max(24, (flick.width - width) / 2)
      y: 56
      width: Math.min(760, flick.width - 48)
      spacing: 14

      // What it is, and how many.
      Row {
        spacing: 14
        Text {
          textFormat: Text.PlainText
          text: Lang.t("Tasks")
          font.family: tv.theme.uiFont
          font.pixelSize: 26
          font.weight: Font.DemiBold
          color: tv.theme.text
        }
        Text {
          objectName: "taskCount"
          topPadding: 12
          textFormat: Text.PlainText
          text: tv.list.length + " " + ({ open: "open", todo: "to do", doing: "in progress", done: "done", cancelled: "cancelled" })[tv.status] + (tv.overdue ? "  ·  " + tv.overdue + Lang.t(" overdue") : "")
          font.family: tv.theme.uiFont
          font.pixelSize: 13
          color: tv.overdue ? tv.red() : tv.theme.muted
        }
      }

      // Their status: one picked filters them.
      Flow {
        width: parent.width
        spacing: 6
        Repeater {
          model: Tasks.STATUSES
          delegate: Chip {
            required property var modelData
            objectName: "taskStatus_" + modelData.id
            theme: tv.theme
            text: Lang.t(modelData.label) + (tv.counts[modelData.id] !== undefined ? "  " + tv.counts[modelData.id] : "")
            checked: tv.status === modelData.id
            onClicked: tv.status = modelData.id
          }
        }
      }

      // The tags they have most: one picked filters them.
      Flow {
        width: parent.width
        spacing: 6
        visible: tv.everyTag.length > 0
        Chip { objectName: "taskTag_"; theme: tv.theme; text: Lang.t("All"); checked: tv.tag === ""; onClicked: tv.tag = "" }
        Repeater {
          model: tv.everyTag
          delegate: Chip {
            required property var modelData
            objectName: "taskTag_" + modelData.name
            theme: tv.theme
            text: "#" + modelData.name + "  " + modelData.n
            checked: tv.tag === modelData.name
            onClicked: tv.tag = tv.tag === modelData.name ? "" : modelData.name
          }
        }
      }

      Text {
        visible: tv.list.length === 0
        width: parent.width
        wrapMode: Text.Wrap
        textFormat: Text.PlainText
        text: tv.status !== "open" ? Lang.t("None ") + (tv.status === "todo" ? "to do" : tv.status === "doing" ? Lang.t("in progress") : tv.status) + (tv.tag ? Lang.t(" with #") + tv.tag : "") + "." : tv.tag ? Lang.t("No open to-do with #") + tv.tag + "." : Lang.t("No open to-dos. Every to-do on your pages that isn't ticked is here, with its date (@ a day in its line) and #prio-hoch, #prio-niedrig or #in-arbeit.")
        font.family: tv.theme.uiFont
        font.pixelSize: 14
        color: tv.theme.muted
      }

      Repeater {
        model: tv.groups
        delegate: Column {
          id: group
          required property var modelData
          readonly property bool isFolded: tv.folded[modelData.id] === true
          visible: modelData.tasks.length > 0
          width: body.width
          spacing: 2

          // The bucket: a click folds it.
          Rectangle {
            objectName: "taskBucket_" + group.modelData.id
            width: parent.width
            height: 34
            radius: 7
            color: headHover.hovered ? tv.theme.hover : "transparent"
            Text {
              x: 8
              anchors.verticalCenter: parent.verticalCenter
              textFormat: Text.PlainText
              text: (group.isFolded ? "▸  " : "▾  ") + Lang.t(group.modelData.label) + "  " + (group.modelData.id === "closed" ? tv.list.length : group.modelData.tasks.length)
              font.family: tv.theme.uiFont
              font.pixelSize: 12
              font.weight: Font.DemiBold
              font.capitalization: Font.AllUppercase
              font.letterSpacing: 0.6
              color: group.modelData.id === "overdue" ? tv.red() : tv.theme.muted
            }
            HoverHandler { id: headHover; cursorShape: Qt.PointingHandCursor }
            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: tv.fold(group.modelData.id) }
          }

          Repeater {
            model: group.isFolded ? [] : group.modelData.tasks
            delegate: Rectangle {
              id: row
              required property var modelData
              readonly property string html: tv.htmlOf[modelData.page + "/" + modelData.b] || ""
              objectName: "task"
              width: group.width
              height: Math.max(48, words.contentHeight + meta.height + 16)
              radius: 7
              color: rowHover.hovered ? tv.theme.hover : "transparent"

              Rectangle {
                id: box
                objectName: "taskCheck"
                x: 8
                y: 10
                width: 16
                height: 16
                radius: 4
                color: row.modelData.done ? Qt.alpha(tv.theme.text, 0.3) : "transparent"
                border.width: 1.5
                border.color: row.modelData.p > 0 ? tv.red() : Qt.alpha(tv.theme.text, 0.45)
                Text {
                  visible: row.modelData.done === true
                  anchors.centerIn: parent
                  textFormat: Text.PlainText
                  text: row.modelData.c ? "✕" : "✓"
                  font.pixelSize: 11
                  color: tv.theme.background
                }
                HoverHandler { cursorShape: Qt.PointingHandCursor }
                TapHandler {
                  gesturePolicy: TapHandler.ReleaseWithinBounds
                  onTapped: tv.tick(row.modelData.page, row.modelData.b, !row.modelData.done, row.modelData.t)
                }
              }
              Text {
                id: words
                x: 34
                y: 7
                width: parent.width - x - 10 - (rowHover.hovered ? openButtons.width + 6 : 0)
                opacity: row.modelData.done ? 0.6 : 1
                wrapMode: Text.Wrap
                textFormat: row.html ? Text.RichText : Text.PlainText
                text: row.html && tv.view ? tv.view.blockHtml(row.html) : row.modelData.t
                font.family: tv.view ? tv.view.family : tv.theme.uiFont
                font.pixelSize: 14
                color: tv.theme.text
                onLinkActivated: function(link) { tv.view.openFromTag(link) }
                HoverHandler { cursorShape: words.hoveredLink ? Qt.PointingHandCursor : Qt.ArrowCursor }
              }
              // Its page, when, how important, being done.
              Row {
                id: meta
                x: 34
                anchors.top: words.bottom
                anchors.topMargin: 2
                spacing: 10
                Text {
                  visible: row.modelData.done === true && (row.modelData.e || "") !== ""
                  textFormat: Text.PlainText
                  text: (row.modelData.c ? Lang.t("cancelled ") : Lang.t("done ")) + Tasks.when(row.modelData.e || "", new Date(tv.nowMs)).replace(/ days late$/, " days ago")
                  font.family: tv.theme.uiFont
                  font.pixelSize: 12
                  color: tv.theme.muted
                }
                Text {
                  visible: row.modelData.d !== "" && !row.modelData.done
                  textFormat: Text.PlainText
                  text: Tasks.when(row.modelData.d, new Date(tv.nowMs))
                  font.family: tv.theme.uiFont
                  font.pixelSize: 12
                  font.weight: row.modelData.bucket === "overdue" || row.modelData.bucket === "today" ? Font.DemiBold : Font.Normal
                  color: row.modelData.bucket === "overdue" ? tv.red() : row.modelData.bucket === "today" ? tv.theme.accent : tv.theme.muted
                }
                Text {
                  visible: row.modelData.p !== 0 || row.modelData.s !== ""
                  textFormat: Text.PlainText
                  text: (row.modelData.p > 0 ? Lang.t("! important") : row.modelData.p < 0 ? "low" : "") + (row.modelData.p !== 0 && row.modelData.s ? "  ·  " : "") + (row.modelData.s ? Lang.t("in progress") : "")
                  font.family: tv.theme.uiFont
                  font.pixelSize: 12
                  color: row.modelData.p > 0 ? tv.red() : tv.theme.muted
                }
                Text {
                  textFormat: Text.PlainText
                  text: (row.modelData.icon ? row.modelData.icon + " " : "") + row.modelData.title
                  width: Math.min(implicitWidth, row.width - 200)
                  elide: Text.ElideRight
                  font.family: tv.theme.uiFont
                  font.pixelSize: 12
                  color: tv.theme.faint
                }
              }
              HoverHandler { id: rowHover; cursorShape: Qt.PointingHandCursor }
              TapHandler {
                id: rowTap
                onTapped: function(point) {
                  if (words.linkAt(point.position.x - words.x, point.position.y - words.y)) return
                  tv.openTask(row.modelData, Tabs.openHow(rowTap.point.modifiers))
                }
              }
              TapHandler { acceptedButtons: Qt.MiddleButton; onTapped: tv.openTask(row.modelData, "tab") }
              // Its page in a new tab, or beside.
              Row {
                id: openButtons
                objectName: "taskOpen"
                anchors.right: parent.right
                anchors.rightMargin: 6
                y: 6
                spacing: 2
                visible: rowHover.hovered
                IconButton {
                  objectName: "taskOpenTab"
                  theme: tv.theme; icon: "\u{f075c}"; size: 26; iconSize: 14; tint: tv.theme.muted
                  tip: Lang.t("Its page in a new tab  Ctrl+click")
                  onClicked: tv.openTask(row.modelData, "tab")
                }
                IconButton {
                  objectName: "taskOpenBeside"
                  theme: tv.theme; icon: "\u{f0bcc}"; size: 26; iconSize: 14; tint: tv.theme.muted
                  tip: tv.view && tv.view.paneName === "split" ? Lang.t("Its page in the first pane  Ctrl+Shift+click") : Lang.t("Its page beside, in the other pane  Ctrl+Shift+click")
                  onClicked: tv.openTask(row.modelData, "split")
                }
              }
            }
          }

          // (Ticked ones: so many, more a click away.)
          Rectangle {
            objectName: "taskMore"
            visible: group.modelData.id === "closed" && !group.isFolded && tv.list.length > tv.most
            width: parent.width
            height: 34
            radius: 7
            color: moreHover.hovered ? tv.theme.hover : "transparent"
            Text {
              x: 34
              anchors.verticalCenter: parent.verticalCenter
              textFormat: Text.PlainText
              text: Lang.t("Show ") + Math.min(100, tv.list.length - tv.most) + Lang.t(" more")
              font.family: tv.theme.uiFont
              font.pixelSize: 13
              color: tv.theme.accent
            }
            HoverHandler { id: moreHover; cursorShape: Qt.PointingHandCursor }
            TapHandler { onTapped: { tv.most += 100; tv.load() } }
          }
        }
      }
    }
  }
}
