// QueryData.js - (fork) what a query block (Query.js) keeps on its page,
// cleaned, and written as a fence for agents and the Markdown copy and read
// back. Apart from Query.js so Blocks.js can clean it without importing
// Workspace.js (which imports Blocks.js). Shared with tests/query.test.cjs,
// so keep it plain JavaScript with no QML or Node APIs.
.pragma library

var MAX_Q = 500
var VIEWS = ["list", "table"]
var SORTS = ["auto", "order", "title", "modified", "created", "due", "status"]
var COLUMNS = [
  { id: "status", label: "Status" },
  { id: "due", label: "Due" },
  { id: "tags", label: "Tags" },
  { id: "progress", label: "To-dos" },
  { id: "modified", label: "Changed" },
  { id: "created", label: "Created" },
  { id: "path", label: "Where" }
]
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
var COLORS = /^([a-z]{3,12}|#[0-9a-f]{6})(_background)?$/

function cleanColor(v) { return typeof v === "string" && COLORS.test(v) ? v : "" }

// A query block's data as it may be used.
function clean(raw) {
  var r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
  var scope = r.scope === "here" || (typeof r.scope === "string" && UUID.test(r.scope)) ? r.scope : "all"
  var limit = Math.round(Number(r.limit))
  var cols = (Array.isArray(r.cols) ? r.cols : ["status", "due", "tags", "modified"]).filter(function(c, i, all) {
    return COLUMNS.some(function(x) { return x.id === c }) && all.indexOf(c) === i
  })
  return {
    q: typeof r.q === "string" ? r.q.replace(/[\r\n]+/g, " ").slice(0, MAX_Q) : "",
    scope: scope,
    deep: r.deep === true,
    view: VIEWS.indexOf(r.view) >= 0 ? r.view : "list",
    sort: SORTS.indexOf(r.sort) >= 0 ? r.sort : "auto",
    desc: r.desc === true,
    limit: isFinite(limit) && limit >= 5 ? Math.min(200, limit) : 25,
    cols: cols,
    title: typeof r.title === "string" ? r.title.replace(/[\r\n]+/g, " ").slice(0, 120) : "",
    color: cleanColor(r.color),
    background: cleanColor(r.background)
  }
}

// For the Markdown copy and agents: the block as a fence they can read and
// write back ("```query" and its data, a line each).
function toFence(data) {
  var d = clean(data)
  var lines = ["q: " + d.q]
  if (d.scope !== "all") lines.push("scope: " + d.scope)
  if (d.deep) lines.push("deep: yes")
  if (d.view !== "list") lines.push("view: " + d.view)
  if (d.sort !== "auto") lines.push("sort: " + d.sort + (d.desc ? " desc" : ""))
  if (d.limit !== 25) lines.push("limit: " + d.limit)
  if (d.view === "table") lines.push("columns: " + d.cols.join(", "))
  if (d.title) lines.push("title: " + d.title)
  return lines.join("\n")
}

function fromFence(text) {
  var raw = {}
  String(text || "").split(/\r?\n/).forEach(function(line) {
    var m = /^\s*([a-z]+)\s*:\s*(.*?)\s*$/i.exec(line)
    if (!m) return
    var k = m[1].toLowerCase(), v = m[2]
    if (k === "q" || k === "query") raw.q = v
    else if (k === "scope") raw.scope = v
    else if (k === "deep") raw.deep = /^(yes|true|1)$/i.test(v)
    else if (k === "view") raw.view = v
    else if (k === "sort") { var s = v.split(/\s+/); raw.sort = s[0]; raw.desc = s[1] === "desc" }
    else if (k === "limit") raw.limit = Number(v)
    else if (k === "columns" || k === "cols") raw.cols = v.split(/[\s,]+/).filter(function(x) { return x })
    else if (k === "title") raw.title = v
  })
  return clean(raw)
}
