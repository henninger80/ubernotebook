// (fork) Checks Outside.js: the Pages folder changed by a sync tool while
// Uber Notebook runs: what's new, changed or gone between two looks, and
// index.json merged with the tree here (what only it keeps not lost).
// Usage (from the plugin directory): node tests/outside.test.cjs

const assert = require("node:assert/strict");
const { load, plain } = require("./load.cjs");

const O = load("Outside.js");
const W = load("Workspace.js");
let passed = 0;
function check(name, fn) { fn(); passed++; }

const a = W.uuid4(), b = W.uuid4(), c = W.uuid4(), d = W.uuid4();

check("stamps are read from find's lines", () => {
  const s = plain(O.stamps(`${a}.json\t1730000000.1\t120\nindex.json\t1730000001.0\t99\nnotes.txt\t1\t2\nbroken line\n`));
  assert.deepEqual(s, { [`${a}.json`]: "1730000000.1 120", "index.json": "1730000001.0 99" });
});

check("a fingerprint changes with the text", () => {
  assert.equal(O.hash("abc"), O.hash("abc"));
  assert.notEqual(O.hash("abc"), O.hash("abd"));
  assert.notEqual(O.hash(""), O.hash(" "));
});

check("new, changed and gone pages between two looks", () => {
  const known = { [a]: true, [b]: true, [c]: true };
  const before = { [`${a}.json`]: "1 10", [`${b}.json`]: "1 10", [`${c}.json`]: "1 10", "index.json": "1 5" };
  const now = { [`${a}.json`]: "1 10", [`${b}.json`]: "2 11", [`${d}.json`]: "1 3", "index.json": "2 6", "x.json": "1 1" };
  const r = plain(O.diff(before, now, known, W.isUuid));
  assert.deepEqual(r.added, [d]);
  assert.deepEqual(r.changed, [b]);
  assert.deepEqual(r.gone, [c]);
  assert.equal(r.index, true);
  // The first look: only what the tree doesn't know (a file that came after it was read).
  const first = plain(O.diff(null, now, known, W.isUuid));
  assert.deepEqual(first.added, [d]);
  assert.deepEqual(first.changed, []);
  assert.equal(first.index, false);
});

check("many pages gone at once (the folder, not files) aren't taken out", () => {
  assert.deepEqual(plain(O.plausiblyGone([a], 100)), [a]);
  assert.deepEqual(plain(O.plausiblyGone([a, b, c, d], 10)), []);
  assert.deepEqual(plain(O.plausiblyGone([a], 0)), []);
});

const entry = (o) => Object.assign({ title: "T", icon: "", parent: "", children: [], trashed: false, created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z" }, o);

check("what they changed is taken, what we changed stays", () => {
  const base = { top: [a, b, c], favorites: [a], tagColors: {}, fired: { x: 1 }, pages: { [a]: entry(), [b]: entry(), [c]: entry() } };
  const ours = JSON.parse(JSON.stringify(base));
  const theirs = JSON.parse(JSON.stringify(base));
  // They: b in the trash, c archived, favorites changed, a reminder come.
  theirs.pages[b].trashed = true;
  theirs.pages[c].archived = true;
  theirs.favorites = [a, c];
  theirs.fired.y = 2;
  // We: c archived too, a moved under b, a tag colored; they: a reordered top.
  ours.pages[c].archived = true;
  ours.pages[a].parent = b; ours.pages[b].children = [a]; ours.top = [b, c];
  ours.tagColors = { work: "blue" };
  theirs.top = [c, b, a];
  const m = O.mergeIndex(base, ours, theirs);
  assert.equal(m.pages[b].trashed, true);
  assert.equal(m.pages[c].archived, true);
  assert.deepEqual(plain(m.favorites), [a, c]);
  assert.deepEqual(plain(m.fired), { x: 1, y: 2 });
  assert.equal(m.pages[a].parent, b);
  assert.deepEqual(plain(m.top), [b, c]);
  assert.deepEqual(plain(m.tagColors), { work: "blue" });
  // A cleanIndex of it is a tree.
  const ix = W.cleanIndex(m);
  assert.deepEqual(plain(ix.top), [b, c]);
  assert.deepEqual(plain(ix.pages[b].children), [a]);
});

check("a page out of the trash elsewhere comes out here", () => {
  const base = { top: [a], pages: { [a]: entry({ trashed: true }) } };
  const ours = JSON.parse(JSON.stringify(base));
  const theirs = { top: [a], pages: { [a]: entry() } };
  const m = O.mergeIndex(base, ours, theirs);
  assert.ok(!m.pages[a].trashed);
});

check("a page moved elsewhere moves here", () => {
  const base = { top: [a, b], pages: { [a]: entry(), [b]: entry() } };
  const ours = JSON.parse(JSON.stringify(base));
  const theirs = { top: [b], pages: { [a]: entry({ parent: b }), [b]: entry({ children: [a] }) } };
  const ix = W.cleanIndex(O.mergeIndex(base, ours, theirs));
  assert.equal(ix.pages[a].parent, b);
  assert.deepEqual(plain(ix.top), [b]);
});

check("a new page's entry takes what index.json on disk says of it", () => {
  const e = O.seed({ title: "N" }, entry({ trashed: true, archived: true, parent: b, children: [c] }));
  assert.equal(e.trashed, true);
  assert.equal(e.archived, true);
  assert.equal(e.parent, undefined);
  assert.equal(O.seed({ title: "N" }, null).title, "N");
});

check("an event's notes made elsewhere are found by their title", () => {
  const ix = { top: [a, b, c], pages: {
    [a]: entry({ title: "BR · Tue 10 Nov", modified: "2026-11-10T07:40:00Z" }),
    [b]: entry({ title: "BR · Tue 10 Nov", modified: "2026-11-10T09:00:00Z", trashed: true }),
    [c]: entry({ title: "BR · Tue 10 Nov ", modified: "2026-11-10T08:00:00Z" }) } };
  const inTrash = (ix, id) => !!ix.pages[id].trashed;
  assert.equal(O.pageTitled(ix, "BR · Tue 10 Nov", inTrash), c, "the newest not in the trash");
  assert.equal(O.pageTitled(ix, "Other", inTrash), "");
  assert.equal(O.pageTitled(ix, "", inTrash), "");
  assert.equal(O.pageTitled(null, "BR", inTrash), "");
});

console.log(`outside.test.cjs: ${passed} checks passed`);
