import QtQuick

// Settings → Office 365 (fork): signing in, the sync on or off, how often,
// and how the last one went (O365.qml runs it). Drawn like SettingsPanel's
// own groups and lines, which are that file's alone, so it has its own.
Column {
  id: o365
  property var theme: null
  // O365.qml (the service's o365).
  property var sync: null
  readonly property var last: sync ? sync.last : null
  spacing: 22

  function when(seconds) {
    if (!seconds) return "never"
    var d = new Date(seconds * 1000)
    return Qt.formatDateTime(d, new Date().toDateString() === d.toDateString() ? "HH:mm" : "d MMM, HH:mm")
  }
  function summary() {
    if (!sync || !sync.state) return ""
    if (sync.running) return "Syncing now…"
    var l = last
    if (!l) return "Last sync: " + when(sync.state.lastSync)
    if (!l.ok) return "Last try " + when(l.at) + ": " + (l.error || "it failed")
    var s = l.stats || {}
    var down = (s.to_nb || 0) + (s.upd_nb || 0) + (s.del_nb || 0), up = (s.to_g || 0) + (s.upd_g || 0) + (s.del_g || 0)
    return "Last sync " + when(l.at) + ": " + (down || up ? down + " change(s) in, " + up + " out" : "nothing changed") + " · " + sync.state.links + " events linked"
  }

  component Group: Column {
    id: grp
    property string title: ""
    property string note: ""
    default property alias rows: rowsCol.data
    width: o365.width
    spacing: 8
    Text {
      leftPadding: 2
      textFormat: Text.PlainText
      text: grp.title
      font.family: o365.theme.uiFont
      font.pixelSize: 11
      font.weight: Font.DemiBold
      font.capitalization: Font.AllUppercase
      font.letterSpacing: 0.7
      color: o365.theme.muted
    }
    Rectangle {
      width: parent.width
      height: rowsCol.height
      radius: 10
      color: Qt.alpha(o365.theme.text, 0.025)
      border.width: 1
      border.color: o365.theme.line
      Column { id: rowsCol; width: parent.width }
    }
    Text {
      visible: grp.note !== ""
      width: parent.width
      leftPadding: 2
      wrapMode: Text.Wrap
      textFormat: Text.PlainText
      text: grp.note
      font.family: o365.theme.uiFont
      font.pixelSize: 12
      lineHeight: 1.15
      color: o365.theme.muted
    }
  }

  component Line: Item {
    id: line
    property string label: ""
    property string note: ""
    property color noteColor: o365.theme.muted
    property int labelSize: 14
    default property alias control: slot.data
    width: parent ? parent.width : 400
    height: Math.max(52, texts.implicitHeight + 22, slot.height + 16)
    Rectangle { visible: !line.Positioner.isFirstItem; x: 16; width: parent.width - 32; height: 1; color: o365.theme.line; opacity: 0.7 }
    Column {
      id: texts
      anchors.left: parent.left
      anchors.leftMargin: 16
      anchors.right: slot.left
      anchors.rightMargin: 16
      anchors.verticalCenter: parent.verticalCenter
      spacing: 3
      Text { textFormat: Text.PlainText; width: parent.width; text: line.label; wrapMode: Text.WordWrap; font.family: o365.theme.uiFont; font.pixelSize: line.labelSize; color: o365.theme.text }
      Text { textFormat: Text.PlainText; visible: line.note !== ""; width: parent.width; text: line.note; wrapMode: Text.WordWrap; font.family: o365.theme.uiFont; font.pixelSize: 12; lineHeight: 1.1; color: line.noteColor }
    }
    Item {
      id: slot
      anchors.right: parent.right
      anchors.rightMargin: 16
      anchors.verticalCenter: parent.verticalCenter
      width: childrenRect.width
      height: childrenRect.height
    }
  }

  Group {
    title: "Account"
    note: "Signing in uses a code: Microsoft's page opens in your browser, you type the code there and sign in with your work or personal account. The sign-in is kept in ~/.local/state/o365-sync, readable by you alone."
    Line {
      visible: !o365.sync || !o365.sync.signIn
      label: "Office 365"
      note: o365.sync && o365.sync.signInProblem ? o365.sync.signInProblem : o365.sync && o365.sync.signedIn ? "Signed in" : "Not signed in"
      noteColor: o365.sync && o365.sync.signInProblem ? o365.theme.urgent : o365.theme.muted
      TextButton {
        theme: o365.theme
        primary: !(o365.sync && o365.sync.signedIn)
        text: o365.sync && o365.sync.signedIn ? "Sign out" : "Sign in"
        onClicked: if (o365.sync) { if (o365.sync.signedIn) o365.sync.signOut(); else o365.sync.startSignIn() }
      }
    }
    Line {
      visible: !!(o365.sync && o365.sync.signIn)
      label: o365.sync && o365.sync.signIn ? o365.sync.signIn.user_code : ""
      labelSize: 22
      note: o365.sync && o365.sync.signIn ? "Type this code at " + o365.sync.signIn.verification_uri.replace(/^https:\/\//, "") + ", then sign in. This waits till you have." : ""
      Row {
        spacing: 8
        TextButton { theme: o365.theme; icon: o365.theme.icons.copy || ""; text: "Copy"; onClicked: o365.sync.copyCode() }
        TextButton { theme: o365.theme; icon: o365.theme.icons.openExternal || ""; text: "Open page"; onClicked: o365.sync.openSignInPage() }
      }
    }
  }

  Group {
    title: "Calendar sync"
    note: "Both ways: an event added, changed or deleted on one side is on the other at the next sync; changed on both, the later change wins. Synced are the title, the time, all-day and the place. Office 365's repeating events come in (those the calendar can't repeat, as single events); the calendar's own repeating events stay here. Only the profile first synced is synced."
    Line {
      label: "Sync with Office 365"
      note: o365.sync && !o365.sync.signedIn ? "Sign in first" : ""
      Toggle { theme: o365.theme; checked: !!(o365.sync && o365.sync.syncOn); onToggled: function(on) { o365.sync.setEnabled(on) } }
    }
    Line {
      label: "Every"
      Row {
        spacing: 6
        Repeater {
          model: [5, 10, 15, 30, 60]
          TextButton {
            required property int modelData
            theme: o365.theme
            primary: !!(o365.sync && o365.sync.interval === modelData)
            text: modelData + " min"
            onClicked: o365.sync.setEvery(modelData)
          }
        }
      }
    }
    Line {
      label: "Sync now"
      note: o365.summary()
      noteColor: o365.last && !o365.last.ok && !(o365.sync && o365.sync.running) ? o365.theme.urgent : o365.theme.muted
      TextButton {
        theme: o365.theme
        icon: o365.theme.icons.refresh || ""
        text: o365.sync && o365.sync.running ? "Syncing…" : "Sync now"
        onClicked: if (o365.sync && o365.sync.signedIn) o365.sync.syncNow()
      }
    }
  }
}
