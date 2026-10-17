import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"

// The Office 365 sync (fork): O365.qml runs bin/uber-notebook-o365 and reads
// what it says; Settings → Office 365 shows it. The script is played here by
// a fake exec that answers each command as the script would.
Item {
  id: root
  width: 900
  height: 700

  // exec(argv, done, options): the calls kept, each answered from `answers`
  // (by the script's command) at once, or kept waiting in `held`.
  QtObject {
    id: fakeExec
    property var calls: []
    property var answers: ({})
    property var held: ({})
    function exec(argv, done, options) {
      var cmd = argv[3]
      calls = calls.concat([{ argv: argv, options: options || {} }])
      if (held[cmd]) { held[cmd] = done; return }
      var a = answers[cmd]
      if (done) done(a ? a.ok !== false : true, a ? a.out : "")
    }
    property var opened: []
    function openUrl(url) { opened = opened.concat([url]) }
    function commands() { return calls.map(function(c) { return c.argv.slice(3).join(" ") }) }
  }

  property bool pagesReady: false

  UberNotebook.O365 { id: sync; files: fakeExec; pluginDir: "/plugin"; ready: root.pagesReady }

  Theme { id: theme }
  O365Settings { id: page; width: 800; theme: theme; sync: sync }

  function status(signedIn, enabled, last) {
    return JSON.stringify({ signedIn: signedIn, signingIn: false, links: 110, lastSync: 1792227769,
      config: { enabled: enabled, interval: 15, profile: "p-1" }, last: last || null })
  }

  function find(item, test) {
    if (!item) return null
    if (item.visible && test(item)) return item
    for (var i = 0; i < item.children.length; i++) {
      var f = find(item.children[i], test)
      if (f) return f
    }
    return null
  }
  function textShown(t) { return find(page, function(i) { return i.text === t }) }

  TestCase {
    name: "O365"
    when: windowShown

    function init() {
      fakeExec.calls = []
      fakeExec.held = {}
      fakeExec.answers = { status: { out: root.status(true, true) } }
      root.pagesReady = false
      sync.signIn = null
      sync.signInProblem = ""
      sync.running = false
      sync.refresh()
    }

    function test_1_reads_what_the_script_says() {
      compare(fakeExec.calls[0].argv.slice(0, 3), ["/usr/bin/python3", "-I", "/plugin/bin/uber-notebook-o365"])
      compare(fakeExec.commands()[0], "status --json")
      verify(sync.signedIn)
      verify(sync.syncOn)
      compare(sync.interval, 15)
    }

    function test_2_syncs_only_once_the_pages_are_there() {
      sync.syncNow()
      compare(fakeExec.commands().indexOf("sync --json"), -1, "not before the pages are loaded")
      root.pagesReady = true
      fakeExec.held = { sync: true }
      sync.syncNow()
      verify(sync.running)
      sync.syncNow()
      compare(fakeExec.commands().filter(function(c) { return c === "sync --json" }).length, 1, "one at a time")
      compare(fakeExec.calls[fakeExec.calls.length - 1].options.okCodes, [0, 2, 3])
      fakeExec.held.sync(true, "Fetching …\n{\"ok\": true}")
      verify(!sync.running)
      compare(sync.output, "Fetching …\n{\"ok\": true}")
      compare(fakeExec.commands()[fakeExec.calls.length - 1], "status --json", "asked again after")
    }

    function test_3_signing_in_shows_the_code_till_it_goes_through() {
      fakeExec.answers = {
        status: { out: root.status(false, true) },
        "login-start": { out: JSON.stringify({ user_code: "ABCD-1234", verification_uri: "https://microsoft.com/devicelogin", expires_in: 900 }) }
      }
      sync.refresh()
      verify(textShown("Sign in") !== null)
      fakeExec.held = { "login-finish": true }
      sync.startSignIn()
      compare(sync.signIn.user_code, "ABCD-1234")
      compare(fakeExec.opened, ["https://microsoft.com/devicelogin"], "Microsoft's page opened")
      verify(textShown("ABCD-1234") !== null, "the code on the page")
      verify(fakeExec.calls[fakeExec.calls.length - 1].options.timeoutMs > 900000, "waits as long as the code lasts")
      fakeExec.answers.status = { out: root.status(true, true) }
      fakeExec.held["login-finish"](true, "{\"ok\": true}")
      compare(sync.signIn, null)
      verify(sync.signedIn)
      verify(textShown("Sign out") !== null)
    }

    function test_4_a_failed_sign_in_says_why() {
      fakeExec.answers = { status: { out: root.status(false, true) }, "login-start": { ok: false, out: "{\"ok\": false, \"error\": \"Office 365 isn't reachable (no network)\"}" } }
      sync.refresh()
      sync.startSignIn()
      compare(sync.signIn, null)
      compare(sync.signInProblem, "Office 365 isn't reachable (no network)")
    }

    function test_5_the_last_run_in_a_line() {
      fakeExec.answers = { status: { out: root.status(true, true, { ok: false, at: 1792227769, error: "Office 365 isn't reachable (no network)" }) } }
      sync.refresh()
      verify(page.summary().indexOf("Office 365 isn't reachable") > 0, page.summary())
      fakeExec.answers = { status: { out: root.status(true, true, { ok: true, at: 1792227769, stats: { to_nb: 2, upd_g: 1 } }) } }
      sync.refresh()
      verify(page.summary().indexOf("2 change(s) in, 1 out") > 0, page.summary())
    }

    function test_6_settings_go_to_the_script() {
      sync.setEnabled(false)
      sync.setEvery(30)
      var c = fakeExec.commands()
      verify(c.indexOf("config enabled false") >= 0)
      verify(c.indexOf("config interval 30") >= 0)
    }
  }
}
