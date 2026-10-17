import QtQuick

// The Office 365 calendar sync (fork): bin/uber-notebook-o365 run every few
// minutes while it's on and signed in, and from Settings → Office 365 (sign
// in, sync now, on or off, how often). The script does the work, through
// Uber Notebook's own IPC commands, and keeps everything in
// ~/.local/state/o365-sync; this only runs it and shows what it says.
// Wired in by two lines in Service.qml and two in app/SettingsPanel.qml
// (docs/o365-sync.md), so an upstream update merges around it.
Item {
  id: sync

  // Store.qml: programs to run (exec), pages to open in the browser (openUrl).
  property var files: null
  property string pluginDir: ""
  // The pages are loaded (the script's commands are answered).
  property bool ready: false

  readonly property string script: pluginDir + "/bin/uber-notebook-o365"
  // What the script says of itself (status --json): signedIn, links,
  // lastSync, config { enabled, interval, profile }, last { ok, at, error, stats }.
  property var state: null
  readonly property bool signedIn: state !== null && state.signedIn === true
  readonly property bool syncOn: state !== null && state.config && state.config.enabled === true
  readonly property int interval: state && state.config ? state.config.interval : 10
  readonly property var last: state ? state.last : null
  property bool running: false
  // The last run's output, for Settings.
  property string output: ""
  // Signing in: { user_code, verification_uri } while waiting, and why it failed.
  property var signIn: null
  property string signInProblem: ""

  function run(args, done, timeoutMs) {
    if (!files) { if (done) done(false, "", null); return }
    files.exec(["/usr/bin/python3", "-I", script].concat(args), function(ok, out) {
      var text = String(out || "").trim()
      var json = null
      try { json = JSON.parse(text.split("\n").pop()) } catch (e) { json = null }
      if (done) done(ok, text, json)
    }, { timeoutMs: timeoutMs || 20000, maxBytes: 1024 * 1024, okCodes: [0, 2, 3] })
  }

  function refresh() {
    run(["status", "--json"], function(ok, text, json) { if (json && json.config) sync.state = json })
  }

  function syncNow() {
    if (running || !ready) return
    running = true
    run(["sync", "--json"], function(ok, text) {
      sync.running = false
      sync.output = text
      sync.refresh()
    }, 15 * 60000)
  }

  function startSignIn() {
    if (signIn) return
    signInProblem = ""
    run(["login-start"], function(ok, text, json) {
      if (!json || !json.user_code) { sync.signInProblem = json && json.error ? json.error : (text || "couldn't start the sign-in"); return }
      sync.signIn = json
      sync.openSignInPage()
      sync.run(["login-finish"], function(ok2, text2, json2) {
        sync.signIn = null
        if (!json2 || json2.ok !== true) sync.signInProblem = json2 && json2.error ? json2.error : (text2 || "the sign-in didn't go through")
        sync.refresh()
        if (json2 && json2.ok === true) Qt.callLater(sync.syncNow)
      }, (Number(json.expires_in) || 900) * 1000 + 60000)
    })
  }

  function openSignInPage() {
    if (signIn && files) files.openUrl(signIn.verification_uri)
  }

  function copyCode() {
    if (signIn && files) files.exec(["/usr/bin/wl-copy", "--", signIn.user_code], null, { keepChildren: true })
  }

  function signOut() { run(["logout"], function() { sync.refresh() }) }
  function setEnabled(on) { run(["config", "enabled", on ? "true" : "false"], function() { sync.refresh() }) }
  function setEvery(minutes) { run(["config", "interval", String(minutes)], function() { sync.refresh() }) }

  // The first sync two minutes after the pages are there, then every `interval` minutes.
  Timer {
    id: tick
    interval: sync.interval * 60000
    repeat: true
    running: sync.ready && sync.syncOn && sync.signedIn
    onTriggered: sync.syncNow()
  }
  Timer {
    interval: 120000
    running: sync.ready && sync.syncOn && sync.signedIn
    onTriggered: sync.syncNow()
  }

  Component.onCompleted: refresh()
}
