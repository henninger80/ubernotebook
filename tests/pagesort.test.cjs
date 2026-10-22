// (fork) Checks PageSort.js: the pages inside a page in the sidebar, as they
// are on it, by name, last changed first, newest or oldest first; the way
// chosen kept in index.json.
// Usage (from the plugin directory): node tests/pagesort.test.cjs

const assert = require("node:assert/strict");
const { load, plain } = require("./load.cjs");

const S = load("PageSort.js");
const W = load("Workspace.js");
let passed = 0;
function check(name, fn) { fn(); passed++; }

const ids = {};
["p", "x", "b", "a", "c", "u"].forEach((k) => (ids[k] = W.uuid4()));
const name = (id) => Object.keys(ids).find((k) => ids[k] === id) || id;
function tree(sort) {
  const p = (title, created, modified, children) => ({ title, parent: ids.p, created, modified, children: (children || []).map((c) => ids[c]) });
  const pages = {
    [ids.p]: { title: "P", parent: "", children: ["b", "a", "c", "u"].map((c) => ids[c]), sort },
    [ids.b]: p("Beta", "2026-01-02T00:00:00.000Z", "2026-03-01T00:00:00.000Z"),
    [ids.a]: p("alpha 10", "2026-01-03T00:00:00.000Z", "2026-02-01T00:00:00.000Z"),
    [ids.c]: p("Alpha 9", "2026-01-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z"),
    [ids.u]: p("", "2026-01-02T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
    [ids.x]: { title: "X", parent: "", children: [] }
  };
  return W.cleanIndex({ top: [ids.p, ids.x], pages });
}
const shown = (ix) => plain(W.sidebarRows(ix, { [ids.p]: true }, new Date(2026, 9, 22))).pages.filter((r) => r.depth === 1).map((r) => name(r.id));

check("the ways, as they're kept", () => {
  assert.equal(S.clean("title"), "title");
  assert.equal(S.clean("createdOld"), "createdOld");
  for (const m of ["", "nope", null, 3, "MODIFIED"]) assert.equal(S.clean(m), "", String(m));
  assert.equal(S.MODES[0].id, "", "as on the page first");
});

check("each way in the sidebar", () => {
  assert.deepEqual(shown(tree()), ["b", "a", "c", "u"], "as on the page");
  assert.deepEqual(shown(tree("title")), ["c", "a", "b", "u"], "by name: numbers as numbers, case aside, untitled last");
  assert.deepEqual(shown(tree("modified")), ["c", "b", "a", "u"]);
  assert.deepEqual(shown(tree("created")), ["a", "b", "u", "c"], "the same day: as on the page");
  assert.deepEqual(shown(tree("createdOld")), ["c", "b", "u", "a"]);
  assert.deepEqual(plain(W.rows(tree("title"), { [ids.p]: true })).map((r) => name(r.id)), ["p", "c", "a", "b", "u", "x"]);
  assert.deepEqual(plain(tree("title").pages[ids.p].children).map(name), ["b", "a", "c", "u"], "the order on the page stays");
});

check("kept in index.json", () => {
  const ix = tree("modified");
  const back = W.cleanIndex(JSON.parse(W.indexJson(ix)));
  assert.equal(back.pages[ids.p].sort, "modified");
  assert.equal(back.pages[ids.x].sort, "");
  assert.ok(!("sort" in JSON.parse(W.indexJson(tree())).pages[ids.p]), "nothing kept for as on the page");
  assert.equal(tree("bogus").pages[ids.p].sort, "");
});

console.log(`pagesort: ${passed} checks passed`);
