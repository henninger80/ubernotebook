// (fork) Checks Query.js: a query block's data cleaned, its query read,
// the pages it finds (words, tags, status, dates, inside a page), sorted,
// its cells, and its fence for agents and the Markdown copy.
// Usage (from the plugin directory): node tests/query.test.cjs

const assert = require("node:assert/strict");
const { load, plain } = require("./load.cjs");

const Query = load("Query.js");
let passed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { console.error("query: " + name); throw e; } }

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const D = "dddddddd-0000-4000-8000-000000000004";
const T = "eeeeeeee-0000-4000-8000-000000000005";
const X = "ffffffff-0000-4000-8000-000000000006";

const NOW = new Date(2026, 9, 29, 12, 0);
function page(title, extra) {
  return Object.assign({ title, icon: "", parent: "", children: [], trashed: false, created: "2026-01-01T00:00:00Z", modified: "2026-10-01T00:00:00Z", tags: [], project: null, tasks: [], links: [] }, extra || {});
}
function world() {
  const index = { top: [A, T, X], favorites: [C], pages: {
    [A]: page("Projekte", { children: [B, C] }),
    [B]: page("Vereinsfest", { parent: A, children: [D], project: { status: "active", due: "2026-11-02" }, tags: [{ name: "verein", label: "#Verein", n: 1 }], modified: "2026-10-28T09:00:00Z" }),
    [C]: page("Website", { parent: A, project: { status: "done", due: "" }, tags: [{ name: "it", label: "#IT", n: 2 }], created: "2026-10-20T00:00:00Z" }),
    [D]: page("Protokoll Aufbau", { parent: B, tags: [{ name: "verein", label: "#Verein", n: 1 }], tasks: [{ b: "x", t: "Zelt" }], modified: "2026-10-27T00:00:00Z" }),
    [T]: page("Vorlage", { template: true }),
    [X]: page("Alt", { trashed: true, tags: [{ name: "verein", label: "#Verein", n: 1 }] })
  } };
  const texts = {
    [A]: "Projekte\n", [B]: "Vereinsfest\nAufbau am Samstag, Protokoll folgt", [C]: "Website\nRelaunch",
    [D]: "Protokoll Aufbau\nZelt, Bänke, Strom", [T]: "Vorlage\nProtokoll", [X]: "Alt\nProtokoll"
  };
  return { index, texts };
}
const ids = (r) => plain(r.rows).map((x) => x.id);

check("cleaned: defaults, bad values dropped", () => {
  const d = plain(Query.clean({ scope: "nope", view: "grid", limit: 2, cols: ["status", "bogus", "status"], q: "a\nb" }));
  assert.equal(d.scope, "all");
  assert.equal(d.view, "list");
  assert.equal(d.limit, 25);
  assert.deepEqual(d.cols, ["status"]);
  assert.equal(d.q, "a b");
  assert.equal(Query.clean({ scope: A }).scope, A);
  assert.equal(Query.clean({ scope: "here" }).scope, "here");
});

check("read: tags, status, is, dates, in, words, what isn't understood", () => {
  const p = plain(Query.parse('Protokoll #verein -#it status:aktiv is:projekt -is:favorite changed:7d due:overdue in:"Meine Projekte" foo:bar'));
  assert.deepEqual(p.words, ["Protokoll", "foo:bar"]);
  assert.deepEqual(p.tags, ["verein"]);
  assert.deepEqual(p.notTags, ["it"]);
  assert.equal(p.status, "active");
  assert.deepEqual(p.is, ["project"]);
  assert.deepEqual(p.notIs, ["favorite"]);
  assert.equal(p.changed, 7 * 86400000);
  assert.equal(p.due, "overdue");
  assert.equal(p.within, "Meine Projekte");
  assert.deepEqual(plain(Query.parse("status:wrong").bad), ["status:wrong"]);
});

check("words: every page with them, not the trash's or templates'", () => {
  const { index, texts } = world();
  const r = Query.run(index, texts, { q: "Protokoll" }, "", NOW);
  assert.deepEqual(ids(r).sort(), [B, D].sort());
  // The title counts more: first.
  assert.equal(ids(r)[0], D);
});

check("tags and status", () => {
  const { index, texts } = world();
  assert.deepEqual(ids(Query.run(index, texts, { q: "#verein", sort: "title" }, "", NOW)), [D, B]);
  assert.deepEqual(ids(Query.run(index, texts, { q: "status:open" }, "", NOW)), [B]);
  assert.deepEqual(ids(Query.run(index, texts, { q: "status:done" }, "", NOW)), [C]);
  assert.deepEqual(ids(Query.run(index, texts, { q: "is:favorite" }, "", NOW)), [C]);
  assert.deepEqual(ids(Query.run(index, texts, { q: "is:task" }, "", NOW)), [D]);
  assert.deepEqual(ids(Query.run(index, texts, { q: "#verein -is:task" }, "", NOW)), [B]);
});

check("dates: changed, created, due", () => {
  const { index, texts } = world();
  assert.deepEqual(ids(Query.run(index, texts, { q: "changed:3d", sort: "title" }, "", NOW)), [D, B]);
  assert.deepEqual(ids(Query.run(index, texts, { q: "created:2w" }, "", NOW)), [C]);
  assert.deepEqual(ids(Query.run(index, texts, { q: "due:7d" }, "", NOW)), [B]);
  assert.deepEqual(ids(Query.run(index, texts, { q: "due:overdue" }, "", NOW)), []);
  assert.deepEqual(ids(Query.run(index, texts, { q: "due:overdue" }, "", new Date(2026, 10, 5))), [B]);
});

check("inside a page: right inside, deeper, in its order; never itself", () => {
  const { index, texts } = world();
  assert.deepEqual(ids(Query.run(index, texts, { scope: "here" }, A, NOW)), [B, C]);
  assert.deepEqual(ids(Query.run(index, texts, { scope: "here", deep: true }, A, NOW)), [B, D, C]);
  assert.deepEqual(ids(Query.run(index, texts, { scope: B }, A, NOW)), [D]);
  assert.deepEqual(ids(Query.run(index, texts, { q: "in:projekte #verein", sort: "title" }, "", NOW)), [D, B]);
  assert.deepEqual(plain(Query.run(index, texts, { q: "in:Nirgends" }, "", NOW).bad), ["in:Nirgends"]);
  assert.ok(!ids(Query.run(index, texts, {}, A, NOW)).includes(A));
  assert.equal(Query.run(index, texts, { scope: "here" }, "", NOW).total, 0);
});

check("sorted, the other way round, so many", () => {
  const { index, texts } = world();
  assert.deepEqual(ids(Query.run(index, texts, { scope: "here", sort: "title", desc: true }, A, NOW)), [C, B]);
  assert.deepEqual(ids(Query.run(index, texts, { scope: "here", sort: "status" }, A, NOW)), [B, C]);
  assert.deepEqual(ids(Query.run(index, texts, { scope: "here", sort: "due" }, A, NOW)), [B, C]);
  const all = Query.run(index, texts, { limit: 5 }, "", NOW);
  assert.equal(all.total, 4);
  // The last changed first.
  assert.equal(ids(all)[0], B);
});

check("cells", () => {
  const { index } = world();
  assert.equal(Query.cell(index, B, "status", NOW), "Active");
  assert.equal(Query.cell(index, B, "tags", NOW), "#Verein");
  assert.equal(Query.cell(index, D, "path", NOW), "Projekte / Vereinsfest");
  assert.equal(Query.cell(index, B, "modified", NOW), "Yesterday");
  assert.equal(Query.ago("2026-10-29T11:55:00", NOW), "5 min ago");
});

check("fence: written and read back", () => {
  const d = { q: "#verein status:active", scope: "here", deep: true, view: "table", sort: "due", desc: true, limit: 50, cols: ["status", "due"], title: "Vereinsprojekte" };
  const back = plain(Query.fromFence(Query.toFence(d)));
  assert.deepEqual(back, plain(Query.clean(d)));
  assert.equal(Query.toFence({ q: "x" }), "q: x");
});

console.log("query: " + passed + " passed");
