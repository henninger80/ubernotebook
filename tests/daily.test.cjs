// (fork) Checks Daily.js: a day read from a page's title, a day's page found
// in the daily notes' page (and its years'), the calendar's notes, where a
// new one goes, and its title.
// Usage (from the plugin directory): node tests/daily.test.cjs

const assert = require("node:assert/strict");
const { load, plain } = require("./load.cjs");

const Daily = load("Daily.js");
let passed = 0;
function check(name, fn) { fn(); passed++; }

const now = new Date(2026, 9, 18, 9, 30);

check("a day from a title", () => {
  assert.equal(Daily.dateOfTitle("2026-10-16", now), "2026-10-16");
  assert.equal(Daily.dateOfTitle("Journal 2026-10-16 notes", now), "2026-10-16");
  assert.equal(Daily.dateOfTitle("Tagesnotiz, Fri 16 Oct 2026", now), "2026-10-16");
  assert.equal(Daily.dateOfTitle("Tagesnotiz, Thu 10 Jul 2025", now), "2025-07-10");
  // (No year: the one whose weekday it is, nearest now.)
  assert.equal(Daily.dateOfTitle("Tagesnotiz, Fri 16 Oct", now), "2026-10-16");
  assert.equal(Daily.dateOfTitle("Tagesnotiz, Thu 16 Oct", now), "2025-10-16");
  assert.equal(Daily.dateOfTitle("Friday, 16 October 2026", now), "2026-10-16");
  assert.equal(Daily.dateOfTitle("Notiz 16.10.2026", now), "2026-10-16");
  assert.equal(Daily.dateOfTitle("2026", now), "");
  assert.equal(Daily.dateOfTitle("Plans for October", now), "");
  assert.equal(Daily.dateOfTitle("2026-02-30", now), "", "no such day");
});

check("its title without the date, for the calendar", () => {
  assert.equal(Daily.shortTitle("Tagesnotiz, Fri 16 Oct 2026"), "Tagesnotiz");
  assert.equal(Daily.shortTitle("2026-10-16"), "Daily note");
  assert.equal(Daily.noteLabel({ kind: "daily", title: "Tagesnotiz" }, "month"), "\u{1f4d3} Tagesnotiz");
  // (The others as the calendar said them before.)
  assert.equal(Daily.noteLabel({ kind: "due", title: "Launch", text: "Due" }, "month"), "⚑ Launch due");
  assert.equal(Daily.noteLabel({ kind: "due", title: "Launch", text: "Due" }, "agenda"), "⚑ Launch");
  assert.equal(Daily.noteLabel({ kind: "reminder", title: "Plans", text: "call Sam" }, "agenda"), "⏰ Plans: call Sam");
  assert.equal(Daily.noteLabel({ kind: "reminder", title: "Plans", text: "" }, "month"), "⏰ Plans due");
  assert.equal(Daily.noteLabel({ kind: "reminder", title: "Plans", text: "x" }, "week"), "⏰ Plans");
});

function page(title, extra) { return Object.assign({ title, icon: "", parent: "", children: [], trashed: false, created: "", modified: "" }, extra || {}); }
function tree() {
  const pages = {
    dn: page("Tagesnotizen", { children: ["y26", "y25", "loose"] }),
    y26: page("2026", { parent: "dn", children: ["d15", "d14", "d16a", "d16b"] }),
    y25: page("2025", { parent: "dn", children: ["old"] }),
    d15: page("Tagesnotiz, Thu 15 Oct 2026", { parent: "y26" }),
    d14: page("Tagesnotiz, Wed 14 Oct 2026", { parent: "y26" }),
    d16a: page("Tagesnotiz, Fri 16 Oct", { parent: "y26", modified: "2026-10-16T08:00:00Z" }),
    d16b: page("Tagesnotiz, Fri 16 Oct 2026", { parent: "y26", modified: "2026-10-16T09:00:00Z" }),
    old: page("Tagesnotiz, Fri 12 Sep 2025", { parent: "y25" }),
    loose: page("Tagesnotiz, Thu 10 Jul 2025", { parent: "dn" }),
    gone: page("Tagesnotiz, Sat 17 Oct 2026", { parent: "y26", trashed: true }),
    other: page("2026-10-16 Meeting"),
    tpl: page("Tagesnotiz, {{date}}", { template: true }),
    tpl2: page("Retro {{date}}", { template: true })
  };
  return { top: ["dn", "other", "tpl", "tpl2"], pages };
}

check("a day's page: in the page and its years', the one changed last", () => {
  const ix = tree();
  assert.equal(Daily.parentPage(ix, "tagesnotizen"), "dn");
  assert.equal(Daily.find(ix, "Tagesnotizen", "2026-10-16", now), "d16b");
  assert.equal(Daily.find(ix, "Tagesnotizen", "2025-07-10", now), "loose");
  assert.equal(Daily.find(ix, "Tagesnotizen", "2025-09-12", now), "old");
  assert.equal(Daily.find(ix, "Tagesnotizen", "2026-10-17", now), "", "not one in the trash");
  assert.equal(Daily.find(ix, "Daily notes", "2026-10-16", now), "", "not outside its page");
});

check("the calendar's: each day's in the range", () => {
  const ix = tree();
  const got = plain(Daily.inRange(ix, "Tagesnotizen", new Date(2026, 9, 14), new Date(2026, 9, 16), now));
  assert.deepEqual(got.map((n) => n.page).sort(), ["d14", "d15"]);
  assert.equal(got[0].kind, "daily");
  assert.equal(got[0].title, "Tagesnotiz");
  assert.equal(got[0].time, false);
});

check("where a new one goes: first where the newest is first, else last", () => {
  const ix = tree();
  // (Mostly newest first, one out of place at the end.)
  assert.equal(Daily.newestFirst(ix, ix.pages.y26.children, now), true);
  assert.equal(Daily.newestFirst(ix, ["d14", "d15", "d16b"], now), false);
  assert.equal(Daily.newestFirst(ix, ix.pages.dn.children, now), true, "years, newest first");
  assert.deepEqual(plain(Daily.placeAmong(ix, "y26", "new", now)), { parent: "y26", at: 0, before: "d15", after: "" });
  ix.pages.y26.children = ["d14", "d15"];
  assert.deepEqual(plain(Daily.placeAmong(ix, "y26", "new", now)), { parent: "y26", at: -1, before: "", after: "d15" });
});

check("its template, and its title with the year", () => {
  const ix = tree();
  assert.equal(Daily.template(ix, ""), "tpl", "one of yours with {{date}} and daily/tages in its name");
  assert.equal(Daily.template(ix, "Retro {{date}}"), "tpl2", "the one named");
  delete ix.pages.tpl;
  ix.top = ["dn", "other", "tpl2"];
  assert.equal(Daily.template(ix, ""), "", "none: a blank page");
  assert.equal(Daily.titleFor("Tagesnotiz, {{date}}", new Date(2026, 9, 18, 9, 30)), "Tagesnotiz, Sun 18 Oct 2026");
  assert.equal(Daily.dateOfTitle(Daily.titleFor(Daily.BLANK_TITLE, new Date(2027, 0, 1)), now), "2027-01-01");
});

console.log("daily: " + passed + " checks passed");
