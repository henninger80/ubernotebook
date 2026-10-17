import QtQuick

// Settings → Accounts & sync (fork): Office 365 and Google signed in to,
// their calendars (synced or not, the default one for events made here,
// each one's color), and the sync (on, how often, how the last one went).
// Sync.qml does it. Drawn like SettingsPanel's own groups and lines, which
// are that file's alone, so it has its own.
Column {
  id: page
  property var theme: null
  // Sync.qml (the service's sync).
  property var sync: null
  readonly property var last: sync ? sync.last : null
  readonly property var ms: sync && sync.signing ? sync.signing.o365 || null : null
  readonly property var gg: sync && sync.signing ? sync.signing.google || null : null
  property bool editingClient: false
  spacing: 22

  function when(ms) {
    if (!ms) return "never"
    var d = new Date(ms)
    return Qt.formatDateTime(d, new Date().toDateString() === d.toDateString() ? "HH:mm" : "d MMM, HH:mm")
  }
  function summary() {
    if (!sync) return ""
    if (sync.running) return "Syncing " + (sync.phase || "") + "…"
    var l = last
    if (!l) return "Not synced yet"
    if (!l.ok) return "Last sync " + when(l.at) + ": " + (l.error || "it failed")
    var s = l.stats || {}
    var n = (s.in || 0) + (s.gone || 0) + (s.out || 0)
    return "Last sync " + when(l.at) + ": " + (n ? (s.in || 0) + " in, " + (s.out || 0) + " out, " + (s.gone || 0) + " gone" : "nothing changed")
  }

  component Group: Column {
    id: grp
    property string title: ""
    property string note: ""
    default property alias rows: rowsCol.data
    width: page.width
    spacing: 8
    Text {
      leftPadding: 2
      textFormat: Text.PlainText
      text: grp.title
      font.family: page.theme.uiFont
      font.pixelSize: 11
      font.weight: Font.DemiBold
      font.capitalization: Font.AllUppercase
      font.letterSpacing: 0.7
      color: page.theme.muted
    }
    Rectangle {
      width: parent.width
      height: rowsCol.height
      radius: 10
      color: Qt.alpha(page.theme.text, 0.025)
      border.width: 1
      border.color: page.theme.line
      Column { id: rowsCol; width: parent.width }
    }
    Text {
      visible: grp.note !== ""
      width: parent.width
      leftPadding: 2
      wrapMode: Text.Wrap
      textFormat: Text.PlainText
      text: grp.note
      font.family: page.theme.uiFont
      font.pixelSize: 12
      lineHeight: 1.15
      color: page.theme.muted
    }
  }

  component Line: Item {
    id: line
    property string label: ""
    property string note: ""
    property color noteColor: page.theme.muted
    property int labelSize: 14
    property color dot: "transparent"
    default property alias control: slot.data
    width: parent ? parent.width : 400
    height: Math.max(52, texts.implicitHeight + 22, slot.height + 16)
    Rectangle { visible: !line.Positioner.isFirstItem; x: 16; width: parent.width - 32; height: 1; color: page.theme.line; opacity: 0.7 }
    Rectangle {
      id: dotMark
      visible: line.dot.a > 0
      x: 16
      anchors.verticalCenter: parent.verticalCenter
      width: 12; height: 12; radius: 6
      color: line.dot
    }
    Column {
      id: texts
      anchors.left: parent.left
      anchors.leftMargin: dotMark.visible ? 38 : 16
      anchors.right: slot.left
      anchors.rightMargin: 16
      anchors.verticalCenter: parent.verticalCenter
      spacing: 3
      Text { textFormat: Text.PlainText; width: parent.width; text: line.label; wrapMode: Text.WordWrap; font.family: page.theme.uiFont; font.pixelSize: line.labelSize; color: page.theme.text }
      Text { textFormat: Text.PlainText; visible: line.note !== ""; width: parent.width; text: line.note; wrapMode: Text.WordWrap; font.family: page.theme.uiFont; font.pixelSize: 12; lineHeight: 1.1; color: line.noteColor }
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

  // ======== accounts ========

  Group {
    objectName: "syncAccounts"
    title: "Accounts"
    note: "Sign-ins are kept in ~/.local/state/uber-notebook-sync, readable by you alone. Google needs a client of your own: in Google Cloud Console, a project with the Calendar and Tasks APIs on, an OAuth client of the kind Desktop app, and the consent screen set to In production (in Testing, Google's sign-ins run out after 7 days)."

    // Office 365.
    Line {
      visible: !(page.ms && page.ms.code)
      label: "Office 365"
      note: page.ms && page.ms.problem ? page.ms.problem : page.sync && page.sync.signedInMs ? "Signed in" : "Not signed in"
      noteColor: page.ms && page.ms.problem ? page.theme.urgent : page.theme.muted
      TextButton {
        theme: page.theme
        primary: !(page.sync && page.sync.signedInMs)
        text: page.sync && page.sync.signedInMs ? "Sign out" : "Sign in"
        onClicked: if (page.sync) { if (page.sync.signedInMs) page.sync.signOut("o365"); else page.sync.signInMs() }
      }
    }
    Line {
      visible: !!(page.ms && page.ms.code)
      label: page.ms && page.ms.code ? page.ms.code : ""
      labelSize: 22
      note: page.ms && page.ms.uri ? "Office 365: type this code at " + page.ms.uri.replace(/^https:\/\//, "") + " and sign in. This waits till you have." : ""
      Row {
        spacing: 8
        TextButton { theme: page.theme; icon: page.theme.icons.copy || ""; text: "Copy"; onClicked: if (page.sync.files) page.sync.files.exec(["/usr/bin/wl-copy", "--", page.ms.code], null, { keepChildren: true }) }
        TextButton { theme: page.theme; icon: page.theme.icons.openExternal || ""; text: "Open page"; onClicked: page.sync.files.openUrl(page.ms.uri) }
        TextButton { theme: page.theme; text: "Cancel"; onClicked: page.sync.cancelSignIn("o365") }
      }
    }

    // Google: its client first, then signing in.
    Line {
      visible: !!page.sync && page.sync.googleClient && !page.editingClient
      label: "Google"
      note: page.gg && page.gg.problem ? page.gg.problem : page.gg && page.gg.waiting ? "Sign in on Google's page in your browser…" : page.sync && page.sync.signedInGoogle ? "Signed in" : "Not signed in"
      noteColor: page.gg && page.gg.problem ? page.theme.urgent : page.theme.muted
      Row {
        spacing: 8
        TextButton { visible: !(page.sync && page.sync.signedInGoogle); theme: page.theme; text: "Client"; onClicked: { clientId.text = page.sync.config.google.clientId; clientSecret.text = page.sync.config.google.clientSecret; page.editingClient = true } }
        TextButton { visible: !!(page.gg && page.gg.waiting); theme: page.theme; text: "Cancel"; onClicked: page.sync.cancelSignIn("google") }
        TextButton {
          visible: !(page.gg && page.gg.waiting)
          theme: page.theme
          primary: !(page.sync && page.sync.signedInGoogle)
          text: page.sync && page.sync.signedInGoogle ? "Sign out" : "Sign in"
          onClicked: if (page.sync.signedInGoogle) page.sync.signOut("google"); else page.sync.signInGoogle()
        }
      }
    }
    Item {
      objectName: "syncGoogleClient"
      visible: !!page.sync && (!page.sync.googleClient || page.editingClient)
      width: parent.width
      height: clientCol.height + 28
      Rectangle { x: 16; width: parent.width - 32; height: 1; color: page.theme.line; opacity: 0.7 }
      Column {
        id: clientCol
        x: 16; y: 14
        width: parent.width - 32
        spacing: 8
        Text { textFormat: Text.PlainText; text: "Google"; font.family: page.theme.uiFont; font.pixelSize: 14; color: page.theme.text }
        Text { textFormat: Text.PlainText; width: parent.width; wrapMode: Text.Wrap; text: "Your OAuth client from Google Cloud Console (Desktop app): its client ID and its secret."; font.family: page.theme.uiFont; font.pixelSize: 12; color: page.theme.muted }
        Field { id: clientId; width: parent.width; theme: page.theme; placeholder: "Client ID (….apps.googleusercontent.com)"; maximumLength: 300 }
        Field { id: clientSecret; width: parent.width; theme: page.theme; placeholder: "Client secret"; maximumLength: 300; input.echoMode: TextInput.Password }
        Row {
          spacing: 8
          TextButton {
            theme: page.theme
            primary: true
            text: "Save"
            onClicked: { page.sync.setGoogleClient(clientId.text, clientSecret.text); page.editingClient = false }
          }
          TextButton { visible: page.editingClient; theme: page.theme; text: "Cancel"; onClicked: page.editingClient = false }
        }
      }
    }
  }

  // ======== calendars ========

  Group {
    objectName: "syncCalendars"
    visible: !!page.sync && page.sync.calendars.length > 0
    title: "Calendars"
    note: "The calendars synced with yours. An event made here goes to the default one, unless you give it another (in the event, or \u201cHere only\u201d). Turned off, a calendar's events leave yours; they come back when it's on again."
    Repeater {
      model: page.sync ? page.sync.calendars : []
      Line {
        required property var modelData
        dot: modelData.color ? modelData.color : "transparent"
        label: modelData.name
        note: (modelData.provider === "o365" ? "Office 365" : "Google") + (modelData.writable ? "" : " · read only") + (modelData.isDefault ? " · default" : "")
        Row {
          spacing: 10
          TextButton {
            visible: modelData.on && modelData.writable
            anchors.verticalCenter: parent.verticalCenter
            theme: page.theme
            primary: modelData.isDefault
            text: "Default"
            onClicked: page.sync.setDefault(modelData.isDefault ? "" : modelData.key)
          }
          Toggle { anchors.verticalCenter: parent.verticalCenter; theme: page.theme; checked: modelData.on; onToggled: function(on) { page.sync.setCalendarOn(modelData.key, on) } }
        }
      }
    }
  }

  // ======== the sync ========

  Group {
    objectName: "syncSync"
    title: "Sync"
    note: "Both ways: an event added, changed or deleted on one side is on the other at the next sync; changed on both, the later change wins. Synced are the title, the time, all-day, the place and repeats that come from there (those the calendar can't repeat, as single events). Events from one calendar never go to another. Only the profile first synced is synced."
    Line {
      label: "Sync calendars"
      note: page.sync && !page.sync.signedInMs && !page.sync.signedInGoogle ? "Sign in first" : ""
      Toggle { theme: page.theme; checked: !!(page.sync && page.sync.syncOn); onToggled: function(on) { page.sync.setConfig({ enabled: on }) } }
    }
    Line {
      label: "Every"
      Row {
        spacing: 6
        Repeater {
          model: [5, 10, 15, 30, 60]
          TextButton {
            required property int modelData
            theme: page.theme
            primary: !!(page.sync && page.sync.interval === modelData)
            text: modelData + " min"
            onClicked: page.sync.setConfig({ interval: modelData })
          }
        }
      }
    }
    Line {
      label: "Sync now"
      note: page.summary()
      noteColor: page.last && !page.last.ok && !(page.sync && page.sync.running) ? page.theme.urgent : page.theme.muted
      TextButton {
        theme: page.theme
        icon: page.theme.icons.refresh || ""
        text: page.sync && page.sync.running ? "Syncing…" : "Sync now"
        onClicked: if (page.sync) page.sync.syncNow()
      }
    }
  }
}
