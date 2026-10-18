// Properties.js - (fork) a note's front matter (Obsidian's properties) as a line
// at the top of the page it comes in as (Import.fromMarkdown): its tags as
// #tags, then each other property as "key: value", " · " between them:
//
//   tags: [Kopfsprung, IT]          ->  #Kopfsprung #IT · TN: Sam Lee, Kim Park · date: 2025-02-14
//   TN:
//     - Sam Lee
//     - Kim Park
//   date: 2025-02-14
//
// What Uber Notebook keeps of its own (a title, an icon, a project's status
// and due date) and what's only for Obsidian's looks or its own bookkeeping
// (cssclasses, aliases, created and modified times...) isn't on the line.
// [[Links]] in a value stay links. Shared with tests/properties.test.cjs, so
// keep it plain JavaScript with no QML or Node APIs.
.pragma library

var SKIP = /^(title|name|icon|status|due|aliases|alias|cssclasses|cssclass|position|publish|permalink|created|modified|updated|date ?created|date ?modified|kanban-plugin|excalidraw-.*|tag-name|defaultmode|banner.*|obsidianuimode)$/i
var MAX = 600

function unquote(v) {
  var s = String(v || "").trim()
  if (s.length >= 2 && (s.charAt(0) === "\"" || s.charAt(0) === "'") && s.charAt(s.length - 1) === s.charAt(0)) s = s.slice(1, -1)
  return s.trim()
}

// The front matter's lines (between the two ---) -> [{ key, values }], in
// their order: a value, a [a, b] list, or "- item" lines under the key.
function read(lines) {
  var out = []
  var cur = null
  ;(lines || []).forEach(function(l) {
    var m = /^([^\s#:-][^:]*):(?:\s+(.*))?$/.exec(l)
    if (m) {
      var v = (m[2] || "").trim()
      var values = []
      if (/^\[.*\]$/.test(v) && !/^\[\[.*\]\]$/.test(v)) values = v.slice(1, -1).split(",").map(unquote).filter(function(x) { return x })
      else if (v && v !== "|" && v !== ">") values = [unquote(v)]
      cur = { key: m[1].trim(), values: values }
      out.push(cur)
      return
    }
    var item = /^\s*-\s+(.*)$/.exec(l)
    if (item && cur) { var x = unquote(item[1]); if (x) cur.values.push(x) }
  })
  return out
}

// A tag as it's written in a line ("Gelsenkirchen bewegt sich" ->
// "#Gelsenkirchen-bewegt-sich"), or "".
function tag(name) {
  var t = String(name || "").trim().replace(/^#/, "").replace(/\s+/g, "-").replace(/[^\wÀ-ɏ\/-]/g, "")
  return t && !/^\d+$/.test(t) ? "#" + t : ""
}

// The line for the page (Markdown), or "" for none.
function line(lines) {
  var tags = []
  var rest = []
  read(lines).forEach(function(p) {
    if (/^tags?$/i.test(p.key)) {
      p.values.forEach(function(v) { v.split(/[\s,]+/).forEach(function(w) { var t = tag(w); if (t && tags.indexOf(t) < 0) tags.push(t) }) })
      return
    }
    if (SKIP.test(p.key) || !p.values.length) return
    // (A value with what'd be read as Markdown of its own, a heading or a
    // list, is left as words.)
    rest.push(p.key + ": " + p.values.map(function(v) { return v.replace(/^[#>*-]+\s/, "") }).join(", "))
  })
  var s = tags.join(" ")
  if (rest.length) s += (s ? " · " : "") + rest.join(" · ")
  return s.length > MAX ? s.slice(0, MAX) + "…" : s
}
