// (fork) Checks Tasks.js: a to-do read as a task (its words, date, priority,
// being done, tags), what an index entry keeps, every task in its bucket,
// the calendar's, and how a date is said.
// Usage (from the plugin directory): node tests/tasks.test.cjs

const assert = require("node:assert/strict");
const { load, plain } = require("./load.cjs");

const Tasks = load("Tasks.js");
let passed = 0;
function check(name, fn) { fn(); passed++; }

const U = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const tag = (n) => '<a href="uber-notebook://tag/' + n.toLowerCase() + '">#' + n + "</a>";
const date = (d, label) => '<a href="uber-notebook://date/' + d + '">@' + (label || d) + "</a>";
const remind = (d) => '<a href="uber-notebook://remind/' + d + '">⏰ ' + d + "</a>";
const now = new Date(2026, 9, 18, 10, 0);

check("a to-do as a task", () => {
  const t = plain(Tasks.ofBlock({ uid: U(1), type: "check", html: "Call the venue " + tag("todo") + " " + tag("prio-hoch") + " · fällig " + date("2026-10-16", "Fri 16 Oct") }));
  assert.deepEqual(t, { b: U(1), t: "Call the venue", d: "2026-10-16", p: 1, g: ["todo", "prio-hoch"] });
  const r = plain(Tasks.ofBlock({ uid: U(2), type: "check", html: "Send it " + remind("2026-10-20T09:30") + " " + tag("in-arbeit") + " " + tag("low") }));
  assert.equal(r.d, "2026-10-20T09:30");
  assert.equal(r.s, "doing");
  assert.equal(r.p, -1);
  assert.equal(r.t, "Send it");
  assert.equal(Tasks.ofBlock({ uid: U(3), type: "check", checked: true, html: "Done" }), null, "ticked: not a task");
  assert.equal(Tasks.ofBlock({ uid: U(4), type: "check", html: "" }), null, "nothing written");
  assert.equal(Tasks.ofBlock({ uid: U(5), type: "p", html: "Words" }), null);
  assert.equal(plain(Tasks.ofBlock({ uid: U(6), type: "check", html: "Ask " + tag("dringend") })).p, 1);
  assert.equal(plain(Tasks.ofBlock({ uid: U(7), type: "check", html: "Plain" })).p, undefined, "none: left out");
  assert.equal(Tasks.text("A <b>bold</b> one " + tag("x") + " · geplant " + date("2026-10-19")), "A bold one");
  assert.deepEqual(plain(Tasks.ofBlocks([{ uid: U(1), type: "check", html: "a" }, { uid: U(2), type: "p", html: "b" }, { uid: U(3), type: "check", html: "c" }])), [{ b: U(1), t: "a" }, { b: U(3), t: "c" }], "what's empty left out");
});

check("what an index entry keeps", () => {
  assert.deepEqual(plain(Tasks.clean([{ b: U(1), t: "x".repeat(200), d: "2026-02-30", p: 5, s: "maybe", g: ["ok", "Not OK", 3] }, { b: "nope" }, null])),
    [{ b: U(1), t: "x".repeat(120), g: ["ok"] }]);
  const t = plain(Tasks.ofBlock({ uid: U(1), type: "check", html: "Call " + tag("todo") + " " + date("2026-10-16") }));
  assert.deepEqual(plain(Tasks.clean([t])), [t], "as it was made");
  assert.deepEqual(plain(Tasks.clean("no")), []);
});

function world() {
  // (As the tree keeps them: what's empty left out.)
  const page = (title, tasks, extra) => Object.assign({ title, icon: "", parent: "", children: [], trashed: false, modified: "2026-10-01T00:00:00Z", tasks }, extra || {});
  const t = (b, text, d, p, g, s) => Object.assign({ b: U(b), t: text, g: g || ["todo"] }, d ? { d } : {}, p ? { p } : {}, s ? { s } : {});
  return { top: [], pages: {
    a: page("Plans", [t(1, "Late one", "2026-10-15"), t(2, "Today low", "2026-10-18", -1), t(3, "Today high", "2026-10-18T14:00", 1), t(4, "Next week", "2026-10-24", 0, ["kopfsprung"])], { modified: "2026-10-05T00:00:00Z" }),
    b: page("Later", [t(5, "Much later", "2026-12-01"), t(6, "No date", ""), t(7, "No date, important", "", 1, ["todo", "kopfsprung"])]),
    c: page("Bin", [t(8, "Gone", "2026-10-18")], { trashed: true }),
    d: page("Box", [t(9, "Put away", "")], { archived: true }),
    e: page("Child", [t(10, "In the trash's page", "")], { parent: "c" }),
    f: page("Tpl", [t(11, "Template's", "")], { template: true })
  } };
}

check("every task, in its bucket, in order", () => {
  const ix = world();
  const list = plain(Tasks.all(ix, now, ""));
  assert.deepEqual(list.map((x) => x.t), ["Late one", "Today high", "Today low", "Next week", "Much later", "No date, important", "No date"]);
  assert.deepEqual(list.map((x) => x.bucket), ["overdue", "today", "today", "week", "later", "none", "none"]);
  assert.equal(list[0].title, "Plans");
  const b = plain(Tasks.buckets(list));
  assert.deepEqual(b.map((x) => x.id + ":" + x.tasks.length), ["overdue:1", "today:2", "week:1", "later:1", "none:2"]);
  assert.deepEqual(plain(Tasks.all(ix, now, "kopfsprung")).map((x) => x.t), ["Next week", "No date, important"], "by a tag");
  assert.deepEqual(plain(Tasks.topTags(list, 3)), [{ name: "todo", n: 6 }, { name: "kopfsprung", n: 2 }]);
  assert.deepEqual(plain(Tasks.count(ix, now)), { open: 7, late: 1 }, "counted as all has them");
});

check("the calendar's, and how a date is said", () => {
  const ix = world();
  const got = plain(Tasks.inRange(ix, new Date(2026, 9, 18), new Date(2026, 9, 19)));
  assert.deepEqual(got.map((x) => x.title).sort(), ["Today high", "Today low"]);
  assert.equal(got[0].kind, "task");
  assert.equal(Tasks.when("2026-10-18", now), "Today");
  assert.equal(Tasks.when("2026-10-19", now), "Tomorrow");
  assert.equal(Tasks.when("2026-10-15", now), "3 days late");
  assert.equal(Tasks.when("2026-11-02", now), "Mon 2 Nov");
  assert.equal(Tasks.when("", now), "");
  assert.equal(Tasks.bucketOf("2026-10-25", now), "week");
  assert.equal(Tasks.bucketOf("2026-10-26", now), "later");
});

check("done and cancelled, and each one's status", () => {
  const done = plain(Tasks.doneOfBlock({ uid: U(20), type: "check", checked: true, html: "Ship it · fällig " + date("2026-10-10") + " · erledigt " + date("2026-10-12") }));
  assert.deepEqual(done, { b: U(20), t: "Ship it", d: "2026-10-10", e: "2026-10-12" });
  const gone = plain(Tasks.doneOfBlock({ uid: U(21), type: "check", checked: true, html: "Drop it " + tag("abgebrochen") }));
  assert.equal(gone.c, 1);
  assert.equal(Tasks.doneOfBlock({ uid: U(22), type: "check", html: "Open" }), null);
  assert.equal(Tasks.doneOfBlocks([{ uid: U(23), type: "check", checked: true, html: "x" }, { uid: U(24), type: "p", html: "y" }]).length, 1);
  assert.deepEqual(plain(Tasks.cleanDone([{ b: U(25), t: "x", e: "nope", c: 1 }, { b: "bad" }])), [{ b: U(25), t: "x", c: 1 }]);
  assert.equal(Tasks.statusOf({ done: true, c: 1 }), "cancelled");
  assert.equal(Tasks.statusOf({ done: true }), "done");
  assert.equal(Tasks.statusOf({ s: "doing" }), "doing");
  assert.equal(Tasks.statusOf({ s: "" }), "todo");
  assert.equal(plain(Tasks.ofBlock({ uid: U(26), type: "check", html: "Maybe " + tag("abgebrochen") })).s, "cancelled");
  const index = { pages: {
    [U(30)]: { title: "A", parent: "", modified: "2026-10-01", tasks: [{ b: U(31), t: "Open one" }, { b: U(32), t: "Busy", s: "doing" }],
      done: [{ b: U(33), t: "Old", e: "2026-09-01" }, { b: U(34), t: "New", e: "2026-10-15" }, { b: U(35), t: "Gone", c: 1 }] }
  } };
  const names = (l) => plain(l.map((t) => t.t));
  assert.deepEqual(names(Tasks.closed(index, "")), ["New", "Old", "Gone"], "the last done first");
  assert.deepEqual(names(Tasks.forStatus(index, now, "", "done")), ["New", "Old"]);
  assert.deepEqual(names(Tasks.forStatus(index, now, "", "cancelled")), ["Gone"]);
  assert.deepEqual(names(Tasks.forStatus(index, now, "", "doing")), ["Busy"]);
  assert.deepEqual(names(Tasks.forStatus(index, now, "", "todo")), ["Open one"]);
  assert.deepEqual(names(Tasks.forStatus(index, now, "", "open")), ["Busy", "Open one"]);
});

console.log("tasks: " + passed + " checks passed");
