// (fork) Checks Search.js: words found accents aside, umlauts written out,
// a word a letter or two off, scored and with the words around them.
// Usage (from the plugin directory): node tests/search.test.cjs

const assert = require("node:assert/strict");
const { load, plain } = require("./load.cjs");

const Search = load("Search.js");
let passed = 0;
function check(name, fn) { fn(); passed++; }

function page(title, extra) { return Object.assign({ title, icon: "", parent: "", children: [], trashed: false, created: "", modified: "2026-10-01T00:00:00Z" }, extra || {}); }
function world() {
  const index = { top: ["a", "b", "c", "d", "t"], pages: {
    a: page("Gespräch Müller", { modified: "2026-10-03T00:00:00Z" }),
    b: page("Straßenfest", { modified: "2026-10-02T00:00:00Z" }),
    c: page("Vorstandssitzung"),
    d: page("Alt", { trashed: true }),
    t: page("Vorlage Müller", { template: true })
  } };
  const texts = {
    a: "Gespräch Müller\nProtokoll vom Café, mit Frau Müller über den Haushalt",
    b: "Straßenfest\nAufbau in der Hauptstraße, Café-Stand",
    c: "Vorstandssitzung\nTagesordnung: Haushalt 2027, Protokoll",
    d: "Alt\nMüller",
    t: "Vorlage Müller\nMüller"
  };
  return { index, texts };
}
const ids = (r) => plain(r).map((x) => x.id);

check("folded a letter for a letter", () => {
  assert.equal(Search.fold("Müller Straße Café ŁÓDŹ"), "muller strase cafe lodz");
  assert.equal(Search.fold("Müller").length, "Müller".length);
  assert.deepEqual(plain(Search.variants("Mueller")), ["mueller", "muller"]);
  assert.deepEqual(plain(Search.variants("Strasse")), ["strasse", "strase"]);
  assert.deepEqual(plain(Search.variants("Haus")), ["haus"]);
});

check("accents and umlauts aside, every word, not the trash or templates", () => {
  const { index, texts } = world();
  assert.deepEqual(ids(Search.find(index, texts, "muller")), ["a"]);
  assert.deepEqual(ids(Search.find(index, texts, "Mueller")), ["a"], "written without the umlaut");
  assert.deepEqual(ids(Search.find(index, texts, "strasse")), ["b"]);
  assert.deepEqual(ids(Search.find(index, texts, "cafe")), ["a", "b"], "newest first, as both score the same");
  assert.deepEqual(ids(Search.find(index, texts, "haushalt protokoll")), ["a", "c"]);
  assert.deepEqual(ids(Search.find(index, texts, "")), []);
});

check("in the title counts more", () => {
  const { index, texts } = world();
  const r = plain(Search.find(index, texts, "vorstand"));
  assert.deepEqual(r.map((x) => x.id), ["c"]);
  assert.equal(r[0].score, 3, "title only: its text has it in its title line, which isn't counted twice");
  assert.equal(r[0].at, -1);
});

check("a word a letter or two off, when no page has it", () => {
  const { index, texts } = world();
  assert.deepEqual(ids(Search.find(index, texts, "Protkoll")), ["a", "c"]);
  assert.deepEqual(ids(Search.find(index, texts, "Vorstnadssitzung")), ["c"], "two swapped, in the title");
  assert.deepEqual(ids(Search.find(index, texts, "Haushlat")), ["a", "c"]);
  assert.deepEqual(ids(Search.find(index, texts, "xyzzy")), []);
  assert.deepEqual(ids(Search.find(index, texts, "Haus")), ["a", "c"], "a word in a word, as before");
  assert.deepEqual(ids(Search.find(index, texts, "Hasu")), [], "not for four letters or fewer");
  // (Scored lower than found as written.)
  const r = plain(Search.find(index, texts, "Protkoll"));
  assert.equal(r[0].score, 0.5);
  assert.equal(plain(Search.find(index, texts, "Protokol"))[0].score, 1, "part of a word: found as written");
  assert.equal(Search.near("protokol", "protokoll", 1), true);
  assert.equal(Search.near("vorstnad", "vorstand", 1), true);
  assert.equal(Search.near("abcd", "wxyz", 2), false);
});

check("changed pages folded again, the words kept up", () => {
  const { index, texts } = world();
  Search.find(index, texts, "Protkoll");
  texts.c = "Vorstandssitzung\nNiederschrift";
  assert.deepEqual(ids(Search.find(index, texts, "Protkoll")), ["a"]);
  assert.deepEqual(ids(Search.find(index, texts, "Niederschirft")), ["c"]);
});

check("the words around it, from the text as written", () => {
  const { index, texts } = world();
  const r = plain(Search.find(index, texts, "muller"))[0];
  const s = plain(Search.snippet(texts.a, index.pages.a.title, r.at, r.length, 12));
  assert.equal(s.match, "Müller");
  assert.ok(s.before.endsWith("mit Frau "), s.before);
  assert.equal(plain(Search.snippet(texts.c, "Vorstandssitzung", -1, 0, 10)).before, "Tagesordnung: Hausha");
  assert.equal(Search.complete(index, texts), true);
  assert.equal(Search.complete({ pages: { x: page("X") } }, {}), false);
});

console.log("search: " + passed + " checks passed");
