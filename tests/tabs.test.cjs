// (fork) Checks Tabs.js: what a tab may show, tabs kept and brought back,
// a tab opened, closed, switched to and dragged, and a tab's name.
// Usage (from the plugin directory): node tests/tabs.test.cjs

const assert = require("node:assert/strict");
const { load, plain } = require("./load.cjs");

const Tabs = load("Tabs.js");
let passed = 0;
function check(name, fn) { fn(); passed++; }

const U = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const tab = (...h) => ({ history: h, at: h.length - 1 });

check("what a tab may show", () => {
  for (const id of [U(1), "tag:idee", "tag:größe", "calendar", "calendar:2026-10-19", "library", "people", "people:" + U(2), "tasks", "templates"])
    assert.ok(Tabs.isId(id), id);
  for (const id of ["", "x", "tag:", "calendarx", "people:../x", "tag:a\nb", 7, null, "a".repeat(200)])
    assert.ok(!Tabs.isId(id), String(id));
  assert.deepEqual(plain(Tabs.clean([U(1), "nope", "tasks", 3])), [U(1), "tasks"]);
  assert.deepEqual(plain(Tabs.clean("tasks")), []);
  const many = Array.from({ length: 20 }, (_, i) => U(i));
  assert.deepEqual(plain(Tabs.clean(many)), many.slice(-Tabs.MOST));
});

check("kept and brought back", () => {
  const b = plain(Tabs.fromKept([U(1), "bad", "tasks"], 1));
  assert.deepEqual(b, { tabs: [tab(U(1)), tab("tasks")], at: 1 });
  assert.equal(Tabs.fromKept([U(1), U(2)], 9).at, 1, "out of range: the last");
  assert.deepEqual(plain(Tabs.fromKept(null, 0)), { tabs: [], at: 0 });
  // The tab you're on, as the view has it; an empty one left out.
  const tabs = [tab(U(1)), { history: [], at: -1 }, tab(U(3))];
  assert.deepEqual(plain(Tabs.kept(tabs, 2, [U(3), U(4)], 1)), { tabs: [U(1), U(4)], at: 1 });
  assert.deepEqual(plain(Tabs.shown(tabs, 0, [U(5)], 0)), [U(5), "", U(3)]);
});

check("a tab opened", () => {
  const tabs = [tab(U(1)), tab(U(2))];
  const o = plain(Tabs.opened(tabs, 0, [U(1), U(9)], 1, false));
  assert.equal(o.at, 1);
  assert.deepEqual(o.tabs, [tab(U(1), U(9)), { history: [], at: -1 }, tab(U(2))], "after the one you're on, which keeps its history");
  assert.equal(Tabs.opened(tabs, 0, [U(1)], 0, true).at, 2, "at the end");
  const full = Array.from({ length: Tabs.MOST }, (_, i) => tab(U(i)));
  const f = Tabs.opened(full, Tabs.MOST - 1, [U(99)], 0, false);
  assert.equal(f.tabs.length, Tabs.MOST);
  assert.equal(f.at, Tabs.MOST - 1);
});

check("a tab closed", () => {
  const tabs = [tab(U(1)), tab(U(2)), tab(U(3))];
  assert.equal(Tabs.closed([tab(U(1))], 0, [U(1)], 0, 0), null, "not the last");
  const mine = plain(Tabs.closed(tabs, 1, [U(2)], 0, 1));
  assert.equal(mine.at, 1);
  assert.equal(mine.open, U(3), "the one after it");
  assert.deepEqual(mine.history, [U(3)]);
  const last = plain(Tabs.closed(tabs, 2, [U(3)], 0, 2));
  assert.equal(last.at, 1);
  assert.equal(last.open, U(2), "the last: the one before");
  const before = plain(Tabs.closed(tabs, 2, [U(3), U(4)], 1, 0));
  assert.equal(before.at, 1);
  assert.equal(before.open, "", "another tab: you stay");
  assert.deepEqual(before.history, [U(3), U(4)]);
});

check("switched and dragged", () => {
  const tabs = [tab(U(1)), tab(U(2), U(5))];
  assert.equal(Tabs.switched(tabs, 0, [U(1)], 0, 0), null);
  const s = plain(Tabs.switched(tabs, 0, [U(1), U(7)], 1, 1));
  assert.equal(s.open, U(5));
  assert.equal(s.historyAt, 1);
  assert.deepEqual(s.tabs[0], tab(U(1), U(7)), "the one you were on, kept");
  const three = [tab(U(1)), tab(U(2)), tab(U(3))];
  assert.equal(Tabs.moved(three, 0, 0, 2).at, 2, "the one you're on, dragged");
  assert.equal(Tabs.moved(three, 1, 0, 2).at, 0);
  assert.equal(Tabs.moved(three, 1, 2, 0).at, 2);
  assert.equal(Tabs.moved(three, 0, 1, 2).at, 0);
  assert.deepEqual(plain(Tabs.moved(three, 0, 0, 2).tabs.map((t) => t.history[0])), [U(2), U(3), U(1)]);
  assert.equal(Tabs.find(three, 0, [U(8)], 0, U(3)), 2);
  assert.equal(Tabs.find(three, 0, [U(8)], 0, U(1)), -1, "the one you're on shows another now");
});

check("a tab's name", () => {
  const pages = { [U(1)]: { title: "Plan", icon: "📌" }, [U(2)]: { title: "", icon: "" } };
  assert.deepEqual(plain(Tabs.label(U(1), pages)), { title: "Plan", icon: "📌" });
  assert.equal(Tabs.label(U(2), pages).title, "Untitled");
  assert.equal(Tabs.label(U(3), pages).title, "Not there any more");
  assert.equal(Tabs.label("tag:idee", pages, (n) => "#Idee").title, "#Idee");
  assert.equal(Tabs.label("calendar:2026-10-19", pages).title, "Calendar");
  assert.equal(Tabs.label("people:" + U(4), pages).title, "People");
  assert.equal(Tabs.label("", pages).title, "New tab");
});

check("how a click opens a page", () => {
  assert.equal(Tabs.openHow(0), "");
  assert.equal(Tabs.openHow(0x02000000), "", "Shift alone");
  assert.equal(Tabs.openHow(0x04000000), "tab");
  assert.equal(Tabs.openHow(0x04000000 | 0x02000000), "split");
});

console.log(`tabs: ${passed} checks passed`);
