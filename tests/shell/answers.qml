import QtQuick
import Quickshell
import Quickshell.Io
// (tests/run writes the plugin folder here, as a file: URL.)
import "@PLUGIN@" as UN

// Answers.qml in a real Quickshell, asked over IPC as Uber Notebook's
// commands are (qs ipc call): a short answer comes as itself; a long one
// (which Quickshell would cut off) as a file with every character of it,
// taken away after a while and as it stops. Prints PASS/FAIL lines, then DONE.
ShellRoot {
  id: root
  function say(name, ok, extra) { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? " :: " + extra : "")) }

  UN.Store { id: store; active: false }
  UN.Answers { id: answers; store: store; keepMs: 1500 }

  property string dir: ""
  // Text of n characters (none of them plain ASCII only: accents, a dash,
  // an emoji's two halves), as JSON when `json`.
  function make(n, json) {
    var unit = "Pages é — 🙂 line\n"
    var s = ""
    while (s.length < n) s += unit
    s = s.slice(0, n - (json ? 10 : 0))
    if (s.charCodeAt(s.length - 1) >= 0xd800 && s.charCodeAt(s.length - 1) < 0xdc00) s = s.slice(0, -1) + "x"
    return json ? JSON.stringify({ text: s }) : s
  }

  IpcHandler {
    target: "answerstest"
    function text(n: int, json: bool): string { return answers.deliver(root.make(n, json), root.dir) }
    function nowhere(n: int): string { return answers.deliver(root.make(n, false), "") }
  }

  function ask(args, done) {
    store.exec(["/usr/bin/qs", "ipc", "--pid", String(Quickshell.processId), "call", "--", "answerstest"].concat(args), function(ok, out) {
      done(ok, String(out || "").replace(/\n$/, ""))
    }, { timeoutMs: 20000, maxBytes: 1024 * 1024 })
  }
  function exists(path, done) {
    store.exec(["/usr/bin/bash", "-c", "if [ -e \"$1\" ]; then echo there; else echo gone; fi", "exists", path], function(ok, out) { done(String(out).trim() !== "gone") })
  }

  Component.onCompleted: {
    store.exec(["/usr/bin/mktemp", "-d"], function(ok, out) {
      root.dir = String(out).trim()
      if (!ok || !root.dir) { console.log("FAIL setup"); Qt.quit(); return }
      ask(["text", "20000", "false"], function(ok1, short) {
        say("a short answer: itself", ok1 && short === root.make(20000, false), "length " + short.length)
        ask(["text", "300000", "false"], function(ok2, out2) {
          var a = null
          try { a = JSON.parse(out2) } catch (e) {}
          var file = a && a.ok === true ? String(a.file || "") : ""
          say("a long answer: where it is", file.indexOf(root.dir + "/uber-notebook-answer-") === 0 && /\.md$/.test(file), out2.slice(0, 200))
          say("a long answer: every character there", store.readNow(file, 4 * 1024 * 1024) === root.make(300000, false))
          ask(["text", "300000", "true"], function(ok3, out3) {
            var b = null
            try { b = JSON.parse(out3) } catch (e) {}
            var jfile = b && b.ok === true ? String(b.file || "") : ""
            var back = null
            try { back = JSON.parse(store.readNow(jfile, 4 * 1024 * 1024)) } catch (e) {}
            say("a long JSON answer: a .json file that reads back", /\.json$/.test(jfile) && back !== null && back.text === JSON.parse(root.make(300000, true)).text, out3.slice(0, 200))
            ask(["nowhere", "300000"], function(ok4, out4) {
              var c = null
              try { c = JSON.parse(out4) } catch (e) {}
              say("no folder to put it in: said so", c !== null && c.ok === false && /too long/.test(String(c.error)), out4.slice(0, 200))
              // Taken away once it's been kept long enough.
              var later = Qt.createQmlObject('import QtQuick; Timer { interval: 3500 }', root)
              later.triggered.connect(function() {
                exists(file, function(there1) {
                  exists(jfile, function(there2) {
                    say("taken away after a while", !there1 && !there2 && answers.files.length === 0, "md " + there1 + ", json " + there2)
                    // And as it stops: what's left is taken away.
                    ask(["text", "40000", "false"], function(ok5, out5) {
                      var f5 = ""
                      try { f5 = String(JSON.parse(out5).file || "") } catch (e) {}
                      answers.removeAll()
                      var gone = Qt.createQmlObject('import QtQuick; Timer { interval: 500 }', root)
                      gone.triggered.connect(function() {
                        exists(f5, function(there5) {
                          say("taken away as it stops", f5 !== "" && !there5, f5)
                          store.exec(["/usr/bin/rm", "-rf", "--", root.dir], function() { console.log("DONE"); Qt.quit() })
                        })
                      })
                      gone.start()
                    })
                  })
                })
              })
              later.start()
            })
          })
        })
      })
    })
  }
  Timer { interval: 60000; running: true; onTriggered: { console.log("FAIL timeout"); Qt.quit() } }
}
