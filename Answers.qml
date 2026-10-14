import QtQuick
import Quickshell

// A command's answer, as it's sent back. Quickshell sends an answer without
// waiting for it to be read, then closes: past about 100,000 characters the
// rest is lost. A longer answer than `longest` is written to a file in the
// folder given (yours alone), and the answer says where; each file is taken
// away after `keepMs`, and by removeAll() as Uber Notebook stops.
QtObject {
  id: answers

  required property var store
  property int longest: 30000
  property int keepMs: 5 * 60 * 1000
  property var files: []

  // The text to send back for `text`: itself, or where it's been written.
  function deliver(text, dir) {
    var s = typeof text === "string" ? text : String(text)
    if (s.length <= longest) return s
    var path = /^\/./.test(String(dir || "")) ? dir + "/uber-notebook-answer-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + (/^\s*[\[{]/.test(s) ? ".json" : ".md") : ""
    if (!path || !store.writeNowBlocking(path, s)) return JSON.stringify({ ok: false, error: "the answer is too long to send, and couldn't be written to a file" })
    files = files.concat([{ path: path, at: Date.now() }])
    sweep.start()
    return JSON.stringify({ ok: true, file: path, note: "a long answer: read it from this file" })
  }

  function remove(list) {
    if (list.length) Quickshell.execDetached(["/usr/bin/rm", "-f", "--"].concat(list.map(function(f) { return f.path })))
  }
  function removeAll() {
    remove(files)
    files = []
  }

  property Timer sweep: Timer {
    interval: Math.min(60 * 1000, answers.keepMs)
    repeat: true
    onTriggered: {
      var now = Date.now()
      answers.remove(answers.files.filter(function(f) { return now - f.at >= answers.keepMs }))
      answers.files = answers.files.filter(function(f) { return now - f.at < answers.keepMs })
      if (!answers.files.length) stop()
    }
  }
}
