// (fork) Checks Mentions.js: the pages naming a page without a link to it,
// and the first place on one linked.
// Usage (from the plugin directory): node tests/mentions.test.cjs

const assert = require("node:assert/strict");
const { load, plain } = require("./load.cjs");

const Mentions = load("Mentions.js");
let passed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { console.error("mentions: " + name); throw e; } }

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const D = "dddddddd-0000-4000-8000-000000000004";
const E = "eeeeeeee-0000-4000-8000-000000000005";

function page(title, extra) { return Object.assign({ title, icon: "", parent: "", children: [], trashed: false, created: "", modified: "2026-10-01T00:00:00Z", links: [] }, extra || {}); }
function world() {
  const index = { top: [A, B, C, D, E], pages: {
    [A]: page("Gelsensport"),
    [B]: page("Sitzung", { modified: "2026-10-05T00:00:00Z" }),
    [C]: page("Verlinkt", { links: [A] }),
    [D]: page("Gelsensportler"),
    [E]: page("Alt", { trashed: true })
  } };
  const texts = {
    [A]: "Gelsensport\nUnser Verein",
    [B]: "Sitzung\nMit gelsensport über die Halle; Gelsensport zahlt.",
    [C]: "Verlinkt\nGelsensport",
    [D]: "Gelsensportler\nNur Gelsensportler hier",
    [E]: "Alt\nGelsensport"
  };
  return { index, texts };
}

check("named as a whole word, any case, not linked already, not the trash's", () => {
  const { index, texts } = world();
  const r = plain(Mentions.find(index, texts, A));
  assert.deepEqual(r.map((x) => x.id), [B]);
  assert.equal(r[0].count, 2);
  assert.equal(texts[B].slice(r[0].at, r[0].at + r[0].length), "gelsensport");
});

check("umlauts aside; a short title or a date names nothing", () => {
  const { index, texts } = world();
  index.pages[A].title = "Müller";
  texts[B] = "Sitzung\nmit Frau Muller";
  assert.deepEqual(plain(Mentions.find(index, texts, A)).map((x) => x.id), [B]);
  index.pages[A].title = "IT";
  assert.deepEqual(plain(Mentions.find(index, texts, A)), []);
  index.pages[A].title = "2026-10-29";
  assert.deepEqual(plain(Mentions.find(index, texts, A)), []);
});

check("linked in a line: the first place outside a link, the words as written", () => {
  assert.equal(Mentions.linkIn("Mit <b>gelsensport</b> heute", "Gelsensport", A),
    "Mit <b><a href=\"uber-notebook://page/" + A + "\">gelsensport</a></b> heute");
  assert.equal(Mentions.linkIn("<a href=\"https://x\">Gelsensport</a> und Gelsensport.", "Gelsensport", A),
    "<a href=\"https://x\">Gelsensport</a> und <a href=\"uber-notebook://page/" + A + "\">Gelsensport</a>.");
  assert.equal(Mentions.linkIn("Gelsensportler", "Gelsensport", A), "");
});

check("on a page: the first block naming it, not code", () => {
  const p = { id: B, title: "Sitzung", content: ["1", "2", "3"], blocks: {
    "1": { type: "code", html: "Gelsensport" },
    "2": { type: "p", html: "Nichts" },
    "3": { type: "bullet", html: "Gelsensport kommt" }
  } };
  assert.equal(Mentions.linkOnPage(p, "Gelsensport", A), true);
  assert.equal(p.blocks["1"].html, "Gelsensport");
  assert.ok(p.blocks["3"].html.indexOf("uber-notebook://page/" + A) > 0);
  assert.equal(Mentions.linkOnPage(p, "Fehlt", A), false);
});

console.log("mentions: " + passed + " passed");
