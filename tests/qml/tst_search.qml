import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"
import "../../Workspace.js" as Workspace

// [fork] Search (Search.js): Ctrl+P and `find` look in the pages' text in
// memory, accents aside and a word a letter off.
Item {
  id: root
  width: 1320
  height: 900

  FakeFiles { id: files }
  FakeService { id: service; user: ({ sounds: false }) }
  Theme { id: th }
  UberNotebook.Workspace { id: ws; files: files }
  DocView { id: view; anchors.fill: parent; theme: th; workspace: ws; service: service }
  UberNotebook.Api { id: api; workspace: ws; files: files; settings: service.settings }

  TestCase {
    name: "Search"
    when: windowShown

    function fresh() {
      files.reset()
      view.page = null
      view.history = []
      view.historyAt = -1
      ws.welcomed = false
      ws.written = ({})
      ws.load()
      tryCompare(ws, "ready", true, 2000)
      view.activate()
      tryVerify(function() { return view.page !== null }, 2000)
    }
    function found(q) {
      var got = null
      ws.search(q, function(list) { got = list })
      tryVerify(function() { return got !== null }, 3000)
      return got
    }

    function test_1_accents_aside_and_a_letter_off() {
      fresh()
      var a = ws.createPage({ parent: "", title: "Gespräch Müller", blocks: [{ type: "p", html: "Protokoll vom Straßenfest", indent: 0 }] })
      tryVerify(function() { return ws.texts[a.id] !== undefined }, 2000)
      var r = found("Mueller")
      compare(r.map(function(x) { return x.id }), [a.id])
      compare(r[0].title, "Gespräch Müller")
      r = found("strasse")
      compare(r.map(function(x) { return x.id }), [a.id])
      compare(r[0].snippet.match, "Straße", "the words as written")
      r = found("Protkoll")
      compare(r.map(function(x) { return x.id }), [a.id], "a letter off")
      // As the page changes: what it says now.
      var p = ws.readPageNow(a.id)
      p.blocks[p.content[0]].html = "Niederschrift"
      ws.savePage(p)
      compare(found("Protkoll").length, 0)
      compare(found("Niederschirft").map(function(x) { return x.id }), [a.id])
      // From a terminal too.
      var f = JSON.parse(api.find("muller"))
      compare(f.map(function(x) { return x.id }), [a.id])
    }
  }
}
