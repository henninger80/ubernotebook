// (fork) Checks Properties.js: a note's front matter read, and the line at the
// top of its page (its tags as tags, the rest as "key: value"), as a note
// comes in.
// Usage (from the plugin directory): node tests/properties.test.cjs

const assert = require("node:assert/strict");
const { load, plain } = require("./load.cjs");

const Properties = load("Properties.js");
const Import = load("Import.js");
let passed = 0;
function check(name, fn) { fn(); passed++; }

check("read: values, [a, b] lists and - items under a key", () => {
  assert.deepEqual(plain(Properties.read(["tags: [a, \"b c\"]", "TN:", "  - Sam Lee", "  - 'Kim Park'", "date: 2025-02-14", "empty:"])), [
    { key: "tags", values: ["a", "b c"] }, { key: "TN", values: ["Sam Lee", "Kim Park"] }, { key: "date", values: ["2025-02-14"] }, { key: "empty", values: [] }
  ]);
  assert.deepEqual(plain(Properties.read(["projects:", "  - \"[[Website]]\""])), [{ key: "projects", values: ["[[Website]]"] }], "a link stays one");
});

check("the line: tags first, then the rest; what Uber Notebook keeps itself, not", () => {
  assert.equal(Properties.line(["tags:", "  - Kopfsprung", "  - IT", "TN:", "  - Sam Lee", "  - Kim Park", "date: 2025-02-14"]),
    "#Kopfsprung #IT · TN: Sam Lee, Kim Park · date: 2025-02-14");
  assert.equal(Properties.line(["title: Plans", "status: active", "due: 2026-10-12", "cssclasses: [wide]", "dateCreated: 2026-01-01T10:00"]), "", "nothing left");
  assert.equal(Properties.line(["tags: [Gelsenkirchen bewegt sich, 2026, #idea]"]), "#Gelsenkirchen #bewegt #sich #idea", "words in a tag are tags, a number isn't one");
  assert.equal(Properties.tag("Gelsenkirchen bewegt sich"), "#Gelsenkirchen-bewegt-sich");
  assert.equal(Properties.tag("gelsensport/website"), "#gelsensport/website");
});

check("coming in: tags as tags, links as links", () => {
  const ctx = { wiki: (name) => (name === "Website" ? "11111111-1111-4111-8111-111111111111" : "") };
  const out = Import.fromMarkdown("---\ntags:\n  - Kopfsprung\nprojects:\n  - \"[[Website]]\"\n---\n\nText", ctx, {});
  assert.equal(out.blocks.length, 2);
  const first = out.blocks[0].html;
  assert.ok(first.indexOf("uber-notebook://tag/kopfsprung") >= 0, first);
  assert.ok(first.indexOf("uber-notebook://page/11111111-1111-4111-8111-111111111111") >= 0, first);
});

console.log("properties: " + passed + " checks passed");
