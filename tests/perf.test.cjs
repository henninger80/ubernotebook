// [fork] What's made quicker (docs/performance.md): the Library's count,
// counted as gathered, without making the list.
const assert = require("node:assert/strict");
const { load, plain } = require("./load.cjs");

const C = load("Collection.js");
const W = load("Workspace.js");

let passed = 0;
function check(name, fn) { fn(); passed++; }

const U = (n) => "00000000-0000-4000-8000-00000000000" + n;

check("the Library's count is what it gathers", () => {
  const ix = W.emptyIndex();
  const mk = (id, extra) => { ix.pages[id] = W.entry(Object.assign({ created: "2026-09-01T00:00:00.000Z", modified: "2026-09-20T00:00:00.000Z" }, extra)); };
  mk(U(1), { title: "Sync", collected: [
    { kind: "person", block: "b1", type: "mention", title: "Sam", person: "sam" },
    { kind: "link", block: "b2", type: "text", title: "Plan", url: "https://example.com/plan" },
    { kind: "person", block: "b3", type: "mention", title: "Sam", person: "sam" },
    { kind: "link", block: "b6", type: "text", title: "Plan again", url: "https://example.com/plan" },
    { kind: "file", block: "b7", title: "Spec.pdf", src: "assets/file-20261001-090000-abc-spec.pdf", file: "pdf" }] });
  mk(U(2), { title: "Trip", collected: [{ block: "c1", kind: "picture", title: "Picture", src: "assets/20261002-101010-k3f2.png" }] });
  mk(U(3), { title: "Old", trashed: true, collected: [{ block: "d1", kind: "link", url: "https://trash.example.com", title: "gone" }] });
  mk(U(4), { title: "Empty" });
  const skip = (id) => W.inTrash(ix, id) || W.inTemplates(ix, id);
  assert.equal(C.count(ix, skip), plain(W.collected(ix)).length);
  assert.equal(C.count(ix, skip), 4);
  assert.equal(C.count(ix), 5, "nothing skipped");
  assert.equal(C.count(W.emptyIndex(), skip), 0);
});

console.log("perf: " + passed + " checks passed");
