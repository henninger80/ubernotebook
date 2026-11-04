import QtQuick
import QtTest
import "../.." as UberNotebook
import "../../app"
import "../../Workspace.js" as Workspace

// [fork] Changes from outside (Workspace.qml, Outside.js): what a sync tool
// brings into the Pages folder while Uber Notebook runs: a page that wasn't
// there when it was read, a page changed or gone, index.json changed; and a
// page changed elsewhere that's written over here kept in its history.
Item {
  id: root
  width: 1200
  height: 800

  FakeFiles { id: files }
  FakeService { id: service; user: ({ sounds: false }) }
  Theme { id: th }
  UberNotebook.Workspace { id: ws; files: files; outsideInterval: 3600000 }
  DocView { id: view; anchors.fill: parent; theme: th; workspace: ws; service: service }
  SignalSpy { id: said; target: ws; signalName: "failed" }

  TestCase {
    name: "Outside"
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
      said.clear()
    }
    function path(id) { return Workspace.pageFile(files.rootPath, id) }
    function indexPath() { return Workspace.indexFile(files.rootPath) }
    function fileOf(id) { return files.parseJson(files.disk[path(id)] || "") }
    // A page as another computer writes it: its file, as it is there.
    function elsewhere(id, change) {
      var p = Workspace.cleanPage(fileOf(id), id)
      change(p)
      p.modified = new Date(Date.now() + 60000).toISOString()
      delete p.text
      files.disk[path(id)] = Workspace.pageJson(p)
    }
    function versions(id) {
      var dir = Workspace.historyDir(files.rootPath, id) + "/"
      return Object.keys(files.disk).filter(function(k) { return k.indexOf(dir) === 0 }).map(function(k) { return files.parseJson(files.disk[k]) })
    }
    function words(page) { return Workspace.pageText(page) }
    function look() { ws.looking = false; ws.outsideLook() }

    function test_1_a_page_that_came_after_the_start() {
      fresh()
      var p = ws.createPage({ parent: "", title: "Meeting", blocks: [{ type: "p", html: "Minutes", indent: 0 }] })
      ws.flushIndex()
      look()
      // Its file as another computer wrote it, under a new id, and the
      // tree there says it's in the trash (index.json came first).
      var id = Workspace.uuid4()
      var page = Workspace.cleanPage(fileOf(p.id), p.id)
      page.id = id
      page.title = "From the laptop"
      for (var b in page.blocks) if (page.blocks[b].parent === p.id) page.blocks[b].parent = id
      page.content = page.content
      delete page.text
      var raw = files.parseJson(Workspace.indexJson(ws.index))
      raw.pages[id] = { title: "From the laptop", icon: "", parent: "", children: [], trashed: false, archived: true, created: page.created, modified: page.modified }
      raw.top.push(id)
      files.disk[indexPath()] = JSON.stringify(raw)
      ws.indexBase = raw
      ws.indexHash = ""
      files.disk[path(id)] = Workspace.pageJson(page)
      verify(!ws.index.pages[id], "not known yet")
      look()
      verify(ws.index.pages[id], "in the tree")
      compare(ws.index.pages[id].title, "From the laptop")
      compare(ws.index.pages[id].archived, true, "as the tree on disk says")
      verify(ws.index.top.indexOf(id) >= 0)
    }

    function test_2_a_page_changed_elsewhere_is_read_again() {
      fresh()
      var p = ws.createPage({ parent: "", title: "Notes", blocks: [{ type: "p", html: "Before", indent: 0 }] })
      view.open(p.id)
      tryVerify(function() { return view.page && view.page.id === p.id })
      look()
      elsewhere(p.id, function(page) {
        page.title = "Notes (laptop)"
        for (var b in page.blocks) if (page.blocks[b].html === "Before") page.blocks[b].html = "After"
      })
      look()
      compare(ws.index.pages[p.id].title, "Notes (laptop)")
      verify(words(ws.readPageNow(p.id)).indexOf("After") >= 0, "what commands read")
      verify(!ws.written[p.id], "the copy written here put aside")
      tryVerify(function() { return view.page && view.page.title === "Notes (laptop)" }, 2000, "the open page shown as it is now")
      // What it was here is in its history.
      verify(versions(p.id).some(function(v) { return v.why === "sync" && words(v.page).indexOf("Before") >= 0 }))
      compare(said.count, 0, "nothing to say: nothing was written over")
    }

    function test_3_written_over_here_kept_in_history() {
      fresh()
      var p = ws.createPage({ parent: "", title: "Plan", blocks: [{ type: "p", html: "Mine", indent: 0 }] })
      look()
      // Changed elsewhere, and saved here before a look saw it.
      elsewhere(p.id, function(page) { for (var b in page.blocks) if (page.blocks[b].html === "Mine") page.blocks[b].html = "Theirs" })
      var mine = ws.readPageNow(p.id)
      for (var b in mine.blocks) if (mine.blocks[b].html === "Mine") mine.blocks[b].html = "Mine, changed"
      ws.savePage(mine)
      verify(words(Workspace.cleanPage(fileOf(p.id), p.id)).indexOf("Mine, changed") >= 0, "yours is written")
      verify(versions(p.id).some(function(v) { return v.why === "sync" && words(v.page).indexOf("Theirs") >= 0 }), "theirs is in its history")
      compare(said.count, 1, "and said")
      // Written again: nothing more kept, or said.
      ws.savePage(ws.readPageNow(p.id))
      compare(said.count, 1)
      // The look after it: nothing new.
      look()
      verify(words(ws.readPageNow(p.id)).indexOf("Mine, changed") >= 0)
    }

    function test_4_changes_not_written_yet_when_it_changes_elsewhere() {
      fresh()
      var p = ws.createPage({ parent: "", title: "Draft", blocks: [{ type: "p", html: "One", indent: 0 }] })
      view.open(p.id)
      tryVerify(function() { return view.page && view.page.id === p.id })
      look()
      view.pageDirty = true
      elsewhere(p.id, function(page) { for (var b in page.blocks) if (page.blocks[b].html === "One") page.blocks[b].html = "Two" })
      look()
      verify(ws.conflicts[p.id], "the open view said so")
      // Its changes written: theirs kept first.
      var mine = ws.readPageNow(p.id)
      for (var b in mine.blocks) mine.blocks[b].html = mine.blocks[b].html ? "One, typed" : mine.blocks[b].html
      ws.savePage(mine)
      view.pageDirty = false
      verify(versions(p.id).some(function(v) { return v.why === "sync" && words(v.page).indexOf("Two") >= 0 }))
      compare(said.count, 1)
      verify(!ws.conflicts[p.id])
    }

    function test_5_index_changed_elsewhere_is_merged() {
      fresh()
      var a = ws.createPage({ parent: "", title: "A" })
      var b = ws.createPage({ parent: "", title: "B" })
      ws.flushIndex()
      look()
      // Elsewhere: A in the trash, B a favorite.
      var raw = files.parseJson(files.disk[indexPath()])
      raw.pages[a.id].trashed = true
      raw.favorites = [b.id]
      files.disk[indexPath()] = JSON.stringify(raw)
      // Here meanwhile: B renamed (its file), the tree to be written.
      var pb = ws.readPageNow(b.id)
      pb.title = "B here"
      ws.savePage(pb)
      ws.flushIndex()
      var now = files.parseJson(files.disk[indexPath()])
      compare(now.pages[a.id].trashed, true, "their trash kept")
      compare(now.favorites, [b.id], "their favorite kept")
      compare(now.pages[b.id].title, "B here", "our change written")
      verify(Workspace.inTrash(ws.index, a.id), "and here")
      // And a look that finds it changed does the same.
      raw = files.parseJson(files.disk[indexPath()])
      raw.pages[a.id].trashed = false
      files.disk[indexPath()] = JSON.stringify(raw)
      look()
      verify(!Workspace.inTrash(ws.index, a.id), "out of the trash, as there")
    }

    function test_6_a_page_gone_elsewhere() {
      fresh()
      var keep = []
      for (var i = 0; i < 6; i++) keep.push(ws.createPage({ parent: "", title: "Keep " + i }))
      var p = ws.createPage({ parent: "", title: "Gone" })
      ws.written = ({})
      look()
      delete files.disk[path(p.id)]
      look()
      verify(!ws.index.pages[p.id], "out of the tree")
      compare(ws.index.top.indexOf(p.id), -1)
      // The folder gone (all of them at once): left as it is.
      keep.forEach(function(k) { delete files.disk[path(k.id)] })
      look()
      verify(ws.index.pages[keep[0].id], "not taken out")
    }
  }
}
