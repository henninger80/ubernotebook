// Tests for Sync.js (fork): Office 365's and Google's events made
// comparable, their repeats, what a sync plans (new, changed and gone on
// either side, the safety guard, an event given to another calendar, the
// default calendar), and PKCE.
// Usage (from the plugin directory): node tests/sync.test.cjs

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { load, plain } = require("./load.cjs");

const Sync = load("Sync.js");
let passed = 0;
function check(name, fn) { fn(); passed++; }

const now = new Date(2026, 9, 17, 12, 0);
const ev = (id, title, start, end, more) => Object.assign({ id, title, start, end, allDay: false, place: "", repeat: null }, more || {});
const graph = (id, subject, start, end, more) => Object.assign({ id, subject, type: "singleInstance", isAllDay: false,
  start: { dateTime: start + ":00.0000000" }, end: { dateTime: end + ":00.0000000" }, location: { displayName: "" },
  lastModifiedDateTime: "2026-10-01T00:00:00Z" }, more || {});
const remoteOf = (items) => plain(Sync.graphEvents(items, now).events);

check("Office 365's events as ours: times, all-day ends", () => {
  assert.deepEqual(plain(Sync.graphNorm(graph("a", " Standup ", "2026-10-19T09:30", "2026-10-19T09:45"))),
    { title: "Standup", start: "2026-10-19T09:30", end: "2026-10-19T09:45", allDay: false, place: "" });
  const trip = graph("b", "Trip", "2026-11-02T00:00", "2026-11-05T00:00", { isAllDay: true, location: { displayName: "Lisbon" } });
  const n = plain(Sync.graphNorm(trip));
  assert.deepEqual(n, { title: "Trip", start: "2026-11-02", end: "2026-11-04", allDay: true, place: "Lisbon" });
  const body = plain(Sync.graphBody(n, "Europe/Berlin"));
  assert.equal(body.start.dateTime, "2026-11-02T00:00:00");
  assert.equal(body.end.dateTime, "2026-11-05T00:00:00");
  assert.equal(body.start.timeZone, "Europe/Berlin");
});

check("Office 365's repeats: every n, weekdays, until; the rest complex", () => {
  const rec = (pattern, range) => ({ recurrence: { pattern, range: range || { type: "noEnd" } } });
  assert.deepEqual(plain(Sync.graphRepeat(rec({ type: "weekly", interval: 2, daysOfWeek: ["monday"] }))), { freq: "weekly", every: 2, until: "" });
  assert.deepEqual(plain(Sync.graphRepeat(rec({ type: "weekly", interval: 1, daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"] }))), { freq: "weekdays", every: 1, until: "" });
  assert.deepEqual(plain(Sync.graphRepeat(rec({ type: "daily", interval: 1 }, { type: "endDate", endDate: "2026-12-31" }))), { freq: "daily", every: 1, until: "2026-12-31" });
  assert.equal(Sync.graphRepeat(rec({ type: "relativeMonthly", interval: 1 })), "complex");
  assert.equal(Sync.graphRepeat(rec({ type: "weekly", interval: 1, daysOfWeek: ["monday", "thursday"] })), "complex");
  assert.equal(Sync.graphRepeat(rec({ type: "daily", interval: 1 }, { type: "numbered", numberOfOccurrences: 5 })), "complex");
  assert.equal(Sync.graphRepeat({}), null);
});

check("Office 365: out of the days asked for, ended series, complex series apart", () => {
  const items = [
    graph("old", "Old", "2026-01-05T09:00", "2026-01-05T10:00"),
    graph("soon", "Soon", "2026-10-20T09:00", "2026-10-20T10:00"),
    graph("ended", "Ended", "2026-01-05T09:00", "2026-01-05T10:00", { type: "seriesMaster", recurrence: { pattern: { type: "daily", interval: 1 }, range: { type: "endDate", endDate: "2026-03-01" } } }),
    graph("odd", "Odd", "2026-01-05T09:00", "2026-01-05T10:00", { type: "seriesMaster", recurrence: { pattern: { type: "relativeMonthly", interval: 1 }, range: { type: "noEnd" } } }),
    graph("x", "Moved one", "2026-10-21T09:00", "2026-10-21T10:00", { type: "exception" })
  ];
  const got = Sync.graphEvents(items, now);
  assert.deepEqual(Object.keys(plain(got.events)), ["soon"]);
  assert.deepEqual(plain(got.complex), ["odd"]);
  const times = Sync.graphTimes([graph("odd-1", "Odd", "2026-11-03T09:00", "2026-11-03T10:00", { seriesMasterId: "odd" }), graph("z", "Z", "2026-11-03T09:00", "2026-11-03T10:00", { seriesMasterId: "other" })], ["odd"], {});
  assert.deepEqual(Object.keys(plain(times)), ["odd-1"]);
});

check("Google's events as ours, and back", () => {
  const e = { id: "g1", summary: "Lunch", location: "Café", start: { dateTime: "2026-10-20T12:30:00+02:00" }, end: { dateTime: "2026-10-20T13:30:00+02:00" }, updated: "2026-10-01T00:00:00Z" };
  assert.deepEqual(plain(Sync.googleNorm(e)), { title: "Lunch", start: "2026-10-20T12:30", end: "2026-10-20T13:30", allDay: false, place: "Café" });
  const day = { id: "g2", summary: "Holiday", start: { date: "2026-12-24" }, end: { date: "2026-12-27" } };
  const n = plain(Sync.googleNorm(day));
  assert.deepEqual(n, { title: "Holiday", start: "2026-12-24", end: "2026-12-26", allDay: true, place: "" });
  assert.deepEqual(plain(Sync.googleBody(n, "Europe/Berlin")), { summary: "Holiday", location: "", start: { date: "2026-12-24" }, end: { date: "2026-12-27" } });
  assert.deepEqual(plain(Sync.googleBody(Sync.googleNorm(e), "Europe/Berlin")).start, { dateTime: "2026-10-20T12:30:00", timeZone: "Europe/Berlin" });
});

check("Google's RRULEs", () => {
  const r = (rule) => plain(Sync.googleRepeat({ recurrence: [rule] }));
  assert.deepEqual(r("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"), { freq: "weekly", every: 2, until: "" });
  assert.deepEqual(r("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"), { freq: "weekdays", every: 1, until: "" });
  assert.deepEqual(r("RRULE:FREQ=DAILY;UNTIL=20261231T225959Z"), { freq: "daily", every: 1, until: "2026-12-31" });
  assert.deepEqual(r("RRULE:FREQ=YEARLY"), { freq: "yearly", every: 1, until: "" });
  assert.equal(r("RRULE:FREQ=MONTHLY;BYDAY=2TU"), "complex");
  assert.equal(r("RRULE:FREQ=WEEKLY;COUNT=4"), "complex");
  assert.equal(r("RRULE:FREQ=WEEKLY;BYDAY=MO,TH"), "complex");
  assert.equal(Sync.googleRepeat({}), null);
  const got = Sync.googleEvents([
    { id: "a", summary: "A", start: { dateTime: "2026-10-20T09:00:00+02:00" }, end: { dateTime: "2026-10-20T10:00:00+02:00" } },
    { id: "b", status: "cancelled" },
    { id: "c", recurringEventId: "s", summary: "One time moved", start: { dateTime: "2026-10-20T09:00:00+02:00" }, end: { dateTime: "2026-10-20T10:00:00+02:00" } },
    { id: "s", summary: "Second Tuesday", recurrence: ["RRULE:FREQ=MONTHLY;BYDAY=2TU"], start: { dateTime: "2026-01-13T09:00:00+01:00" }, end: { dateTime: "2026-01-13T10:00:00+01:00" } }
  ], now);
  assert.deepEqual(Object.keys(plain(got.events)), ["a"]);
  assert.deepEqual(plain(got.complex), ["s"]);
});

const K = "o365:cal";
const base = (o) => Object.assign({ cal: K, remote: {}, links: [], local: [], linkedElsewhere: {}, assigned: {}, fallback: K, last: now.getTime() - 600000, now }, o);
const linked = (nb, rid, n, repeat) => ({ nb, cal: K, rid, fp: Sync.fp(n, repeat || null), title: n.title, start: n.start, recurring: !!repeat });
const ops = (p) => plain(p.actions).map((a) => a.op + " " + (a.nb || a.rid));

check("new on either side goes to the other; once linked, nothing more", () => {
  const remote = remoteOf([graph("r1", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00")]);
  const p = Sync.plan(base({ remote, local: [ev("n1", "Dentist", "2026-10-21T15:00", "2026-10-21T16:00")] }));
  assert.deepEqual(ops(p), ["localCreate r1", "remoteCreate n1"]);
  const n1 = Sync.norm(ev("n1", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00"));
  const q = Sync.plan(base({ remote, links: [linked("n1", "r1", n1)], local: [ev("n1", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00")] }));
  assert.deepEqual(plain(q.actions), []);
  assert.equal(q.links.length, 1);
});

check("a change comes from the side it was made on; on both, the later", () => {
  const was = Sync.norm(ev("n1", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00"));
  const there = remoteOf([graph("r1", "Kickoff (moved)", "2026-10-20T11:00", "2026-10-20T12:00")]);
  let p = Sync.plan(base({ remote: there, links: [linked("n1", "r1", was)], local: [ev("n1", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00")] }));
  assert.deepEqual(ops(p), ["localUpdate n1"]);
  assert.equal(p.actions[0].n.start, "2026-10-20T11:00");
  const same = remoteOf([graph("r1", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00")]);
  p = Sync.plan(base({ remote: same, links: [linked("n1", "r1", was)], local: [ev("n1", "Kickoff", "2026-10-20T09:30", "2026-10-20T10:30")] }));
  assert.deepEqual(ops(p), ["remoteUpdate r1"]);
  assert.equal(p.actions[0].n.start, "2026-10-20T09:30");
  // Both: Office 365's change is older than the middle of the time since the last sync: ours.
  p = Sync.plan(base({ remote: there, links: [linked("n1", "r1", was)], local: [ev("n1", "Kickoff (here)", "2026-10-20T09:00", "2026-10-20T10:00")] }));
  assert.deepEqual(ops(p), ["remoteUpdate r1"]);
  const later = remoteOf([graph("r1", "Kickoff (moved)", "2026-10-20T11:00", "2026-10-20T12:00", { lastModifiedDateTime: new Date(now.getTime() - 1000).toISOString() })]);
  p = Sync.plan(base({ remote: later, links: [linked("n1", "r1", was)], local: [ev("n1", "Kickoff (here)", "2026-10-20T09:00", "2026-10-20T10:00")] }));
  assert.deepEqual(ops(p), ["localUpdate n1"]);
});

check("a link from before (no fp yet): Office 365's version", () => {
  const there = remoteOf([graph("r1", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00")]);
  const l = { nb: "n1", cal: K, rid: "r1", fp: "", title: "Kickoff", start: "2026-10-20T09:00", recurring: false };
  let p = Sync.plan(base({ remote: there, links: [l], local: [ev("n1", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00")] }));
  assert.deepEqual(plain(p.actions), []);
  assert.ok(p.links[0].fp, "the fp kept from now on");
  p = Sync.plan(base({ remote: there, links: [l], local: [ev("n1", "Kickoff!", "2026-10-20T09:00", "2026-10-20T10:00")] }));
  assert.deepEqual(ops(p), ["localUpdate n1"]);
});

check("gone on one side: gone on the other; out of the days asked for, kept", () => {
  const a = Sync.norm(ev("n1", "A", "2026-10-20T09:00", "2026-10-20T10:00"));
  const far = Sync.norm(ev("n2", "Far", "2028-01-10T09:00", "2028-01-10T10:00"));
  const b = Sync.norm(ev("n3", "B", "2026-10-22T09:00", "2026-10-22T10:00"));
  const remote = remoteOf([graph("r3", "B", "2026-10-22T09:00", "2026-10-22T10:00")]);
  const p = Sync.plan(base({ remote, links: [linked("n1", "r1", a), linked("n2", "r2", far), linked("n3", "r3", b)],
    local: [ev("n1", "A", "2026-10-20T09:00", "2026-10-20T10:00"), ev("n2", "Far", "2028-01-10T09:00", "2028-01-10T10:00")] }));
  assert.deepEqual(ops(p), ["localDelete n1", "remoteDelete r3"]);
  assert.deepEqual(plain(p.links).map((l) => l.nb), ["n2"]);
});

check("the safety guard: most of it gone at once, nothing done", () => {
  const links = [], local = [];
  for (let i = 0; i < 10; i++) {
    const e = ev("n" + i, "E" + i, "2026-10-2" + (i % 9) + "T09:00", "2026-10-2" + (i % 9) + "T10:00");
    local.push(e);
    links.push(linked(e.id, "r" + i, Sync.norm(e)));
  }
  const p = Sync.plan(base({ remote: {}, links, local }));
  assert.ok(p.refused);
  assert.deepEqual(plain(p.actions), []);
});

check("[fork] unlinked on both sides and the same: linked, not made again", () => {
  const remote = remoteOf([graph("r1", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00"), graph("r2", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00")]);
  const local = [ev("n1", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00")];
  const p = Sync.plan(base({ remote, local }));
  assert.deepEqual(ops(p), ["localCreate r2"]);
  assert.deepEqual(plain(p.links).map((l) => l.nb + ">" + l.rid), ["n1>r1"]);
});

check("[fork] a calendar with links that would make many events at once: nothing done", () => {
  const n0 = ev("n0", "Old", "2026-10-20T09:00", "2026-10-20T10:00");
  const local = [n0], remote = {};
  for (let i = 0; i < 50; i++) local.push(ev("x" + i, "New " + i, "2026-10-21T09:00", "2026-10-21T10:00"));
  const lone = base({ local, links: [linked("n0", "r0", Sync.norm(n0))], remote: remoteOf([graph("r0", "Old", "2026-10-20T09:00", "2026-10-20T10:00")]) });
  const p = Sync.plan(lone);
  assert.ok(p.refused);
  assert.deepEqual(plain(p.actions), []);
  assert.ok(!Sync.plan(Object.assign({}, lone, { links: [] })).refused);
});

check("[fork] Google and Office 365 straight: pairs, new, changed and gone", () => {
  const O = remoteOf([graph("o1", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00"), graph("o2", "Only here", "2026-10-21T09:00", "2026-10-21T10:00")]);
  const G = plain({ g1: { rid: "g1", n: Sync.norm(ev("x", "Kickoff", "2026-10-20T09:00", "2026-10-20T10:00")), repeat: null, modified: 1 },
                    g2: { rid: "g2", n: Sync.norm(ev("x", "Only there", "2026-10-22T09:00", "2026-10-22T10:00")), repeat: null, modified: 1 } });
  let p = Sync.planBridge({ o365: O, google: G, links: [], now });
  assert.deepEqual(plain(p.actions).map((a) => a.op + " " + a.rid).sort(), ["createG o2", "createO g2"]);
  assert.deepEqual(plain(p.links).map((l) => l.o + ">" + l.g), ["o1>g1"]);
  // Linked, then gone on Google: gone on Office 365 (in the window).
  const link = p.links[0];
  p = Sync.planBridge({ o365: O, google: {}, links: [link], now });
  assert.deepEqual(plain(p.actions).filter((a) => a.op.indexOf("delete") === 0).map((a) => a.op + " " + a.rid), ["deleteO o1"]);
  // Changed on Google only: Office 365 gets it.
  G.g1.n.title = "Kickoff 2";
  p = Sync.planBridge({ o365: O, google: G, links: [link], now });
  assert.ok(plain(p.actions).some((a) => a.op === "updateO" && a.rid === "o1"));
});

check("[fork] Google and Office 365 straight: a complex series' times are not made again next to it", () => {
  const O = remoteOf([graph("o1", "Series", "2026-11-10T09:00", "2026-11-10T10:00")]);
  O.o1.instance = true;
  const G = plain({ g1: { rid: "g1", n: Sync.norm(ev("x", "Series", "2026-11-10T09:00", "2026-11-10T10:00")), repeat: null, modified: 1 } });
  const p = Sync.planBridge({ o365: O, google: G, links: [], now });
  assert.deepEqual(plain(p.actions), []);
  assert.deepEqual(plain(p.links), []);
});

check("[fork] series: a pattern goes to the plain form and back, both sides", () => {
  const second = graph("m", "BR", "2026-05-12T10:00", "2026-05-12T11:00", { type: "seriesMaster",
    recurrence: { pattern: { type: "relativeMonthly", interval: 1, daysOfWeek: ["tuesday"], index: "second" }, range: { type: "endDate", startDate: "2026-05-12", endDate: "2027-05-12" } } });
  const c = plain(Sync.recOfGraph(second));
  assert.deepEqual(c, { freq: "monthly", interval: 1, days: ["TU"], nth: 2, monthday: 0, month: 0, until: "2027-05-12", count: 0 });
  assert.equal(Sync.rruleOf(c, false), "RRULE:FREQ=MONTHLY;BYDAY=2TU;UNTIL=20270512T235959Z");
  assert.deepEqual(plain(Sync.recOfRrule({ start: { dateTime: "2026-04-14T10:00:00+02:00" }, recurrence: ["RRULE:FREQ=MONTHLY;BYDAY=2TU;UNTIL=20270512T235959Z"] })), c);
  assert.deepEqual(plain(Sync.recOfRrule({ start: { dateTime: "2026-04-14T10:00:00+02:00" }, recurrence: ["RRULE:FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2;UNTIL=20270512"] })), c);
  const back = plain(Sync.graphRecurrence(c, "2026-05-12", "Europe/Berlin"));
  assert.deepEqual(back.pattern.daysOfWeek, ["tuesday"]);
  assert.equal(back.pattern.type + back.pattern.index, "relativeMonthlysecond");
  assert.deepEqual(plain(Sync.recOfGraph({ recurrence: back })), c);
  // Weekly on days, every day-of-month, yearly, counted.
  const w = Sync.recOfRrule({ start: { date: "2026-10-19" }, recurrence: ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR,MO;COUNT=6"] });
  assert.deepEqual(plain(w).days, ["MO", "FR"]);
  assert.equal(Sync.rruleOf(w, true), "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=6");
  assert.equal(Sync.rruleOf(Sync.recOfRrule({ start: { date: "2026-10-19" }, recurrence: ["RRULE:FREQ=MONTHLY"] }), true), "RRULE:FREQ=MONTHLY;BYMONTHDAY=19");
  assert.equal(Sync.recOfRrule({ start: { date: "2026-10-19" }, recurrence: ["RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15"] }), null);
});

check("[fork] series: paired as they are, Office 365 leads, new, gone", () => {
  const n = (title, start, end) => ({ title, start, end, allDay: false, place: "" });
  const rec = (until) => ({ freq: "monthly", interval: 1, days: ["TU"], nth: 2, monthday: 0, month: 0, until, count: 0 });
  const ser = (rid, title, start, end, until) => ({ rid, n: n(title, start, end), rec: rec(until), modified: 1 });
  const O = { o1: ser("o1", "BR", "2026-05-12T10:00", "2026-05-12T11:00", "2027-05-12") };
  const G = { g1: ser("g1", "BR", "2026-04-14T10:00", "2026-04-14T11:00", "2027-05-11") };
  // The same series with other first day and end: linked, nothing sent.
  let p = Sync.planBridge({ o365: {}, google: {}, o365Series: O, googleSeries: G, links: [], now });
  assert.deepEqual(plain(p.actions), []);
  assert.deepEqual(plain(p.links).map((l) => l.o + ">" + l.g + " " + l.series), ["o1>g1 true"]);
  // Nothing changed since: nothing. Office 365 changed: Google gets its time, on Google's first day.
  const link = p.links[0];
  assert.deepEqual(plain(Sync.planBridge({ o365: {}, google: {}, o365Series: O, googleSeries: G, links: [link], now }).actions), []);
  O.o1 = ser("o1", "BR", "2026-05-12T09:00", "2026-05-12T10:00", "2027-05-12");
  p = Sync.planBridge({ o365: {}, google: {}, o365Series: O, googleSeries: G, links: [link], now });
  assert.equal(p.actions.length, 1);
  assert.equal(p.actions[0].op, "updateG");
  assert.deepEqual(plain(p.actions[0].n), n("BR", "2026-04-14T09:00", "2026-04-14T10:00"));
  // Only in Google it stays there; only in Office 365 it's made in Google (unless it has run out).
  p = Sync.planBridge({ o365: {}, google: {}, o365Series: {}, googleSeries: G, links: [], now });
  assert.deepEqual(plain(p.actions), []);
  p = Sync.planBridge({ o365: {}, google: {}, o365Series: O, googleSeries: {}, links: [], now });
  assert.deepEqual(plain(p.actions).map((a) => a.op + " " + a.rid), ["createG o1"]);
  const counted = { o2: { rid: "o2", n: n("Old", "2023-08-29T08:00", "2023-08-29T16:00"), rec: Object.assign(rec(""), { freq: "daily", days: [], nth: 0, count: 3 }), modified: 1 } };
  p = Sync.planBridge({ o365: {}, google: {}, o365Series: counted, googleSeries: {}, links: [], now });
  assert.deepEqual(plain(p.actions), []);
  // Gone on one side:
  p = Sync.planBridge({ o365: {}, google: {}, o365Series: {}, googleSeries: G, links: [Object.assign({}, link, { until: "2027-05-12" })], now });
  assert.deepEqual(plain(p.actions).map((a) => a.op + " " + a.rid), ["deleteG g1"]);
  p = Sync.planBridge({ o365: {}, google: {}, o365Series: O, googleSeries: {}, links: [Object.assign({}, link, { until: "2027-05-12" })], now });
  assert.deepEqual(plain(p.actions), []);
  assert.equal(p.links.length, 1);
  // (Ended there: kept, not deleted.)
  p = Sync.planBridge({ o365: {}, google: {}, o365Series: {}, googleSeries: G, links: [Object.assign({}, link, { until: "2026-09-01" })], now });
  assert.deepEqual(plain(p.actions), []);
  // The bodies.
  const body = plain(Sync.googleSeriesBody(n("BR", "2026-05-12T10:00", "2026-05-12T11:00"), rec("2027-05-12"), "Europe/Berlin"));
  assert.deepEqual(body.recurrence, ["RRULE:FREQ=MONTHLY;BYDAY=2TU;UNTIL=20270512T235959Z"]);
  const gb = plain(Sync.graphSeriesBody(n("BR", "2026-05-12T10:00", "2026-05-12T11:00"), rec(""), "Europe/Berlin"));
  assert.equal(gb.recurrence.range.type, "noEnd");
  assert.equal(gb.recurrence.range.startDate, "2026-05-12");
});

check("an event goes to the calendar it's given, else the default; given elsewhere, out of this one", () => {
  const local = [ev("a", "A", "2026-10-20T09:00", "2026-10-20T10:00"), ev("b", "B", "2026-10-20T11:00", "2026-10-20T12:00"), ev("c", "C", "2026-10-20T13:00", "2026-10-20T14:00")];
  let p = Sync.plan(base({ local, assigned: { b: "google:primary", c: "local" } }));
  assert.deepEqual(ops(p), ["remoteCreate a"]);
  p = Sync.plan(base({ cal: "google:primary", local, assigned: { b: "google:primary", c: "local" }, linkedElsewhere: { a: true } }));
  assert.deepEqual(ops(p), ["remoteCreate b"]);
  p = Sync.plan(base({ local, fallback: "local" }));
  assert.deepEqual(plain(p.actions), [], "no default calendar: they stay here");
  // Linked here, then given to Google: out of Office 365.
  const n = Sync.norm(local[0]);
  p = Sync.plan(base({ remote: remoteOf([graph("r1", "A", "2026-10-20T09:00", "2026-10-20T10:00")]), links: [linked("a", "r1", n)], local: [local[0]], assigned: { a: "google:primary" } }));
  assert.deepEqual(ops(p), ["remoteDelete r1"]);
  assert.ok(p.actions[0].moved);
  assert.deepEqual(plain(p.links), []);
});

check("repeating events: theirs come here; ours stay here; a series' title goes there", () => {
  const series = graph("s1", "Jour fixe", "2026-10-05T11:00", "2026-10-05T12:00", { type: "seriesMaster", recurrence: { pattern: { type: "weekly", interval: 1, daysOfWeek: ["monday"] }, range: { type: "noEnd" } } });
  let p = Sync.plan(base({ remote: remoteOf([series]), local: [ev("mine", "Sport", "2026-10-18T07:30", "2026-10-18T10:30", { repeat: { freq: "weekly", every: 1, until: "" } })] }));
  assert.deepEqual(ops(p), ["localCreate s1"]);
  assert.deepEqual(plain(p.actions[0].repeat), { freq: "weekly", every: 1, until: "" });
  const rep = { freq: "weekly", every: 1, until: "" };
  const n = Sync.norm(ev("n1", "Jour fixe", "2026-10-05T11:00", "2026-10-05T12:00"));
  p = Sync.plan(base({ remote: remoteOf([series]), links: [linked("n1", "s1", n, rep)],
    local: [ev("n1", "Jour fixe (Raum 2)", "2026-10-05T11:30", "2026-10-05T12:00", { repeat: rep })] }));
  assert.deepEqual(ops(p), ["remoteUpdate s1", "localUpdate n1"]);
  assert.ok(p.actions[0].recurring);
  assert.equal(p.actions[0].n.title, "Jour fixe (Raum 2)");
  assert.equal(p.actions[1].n.start, "2026-10-05T11:00", "the series' times stay");
});

check("our event made from one there", () => {
  const e = plain(Sync.localEvent(null, { title: "A", start: "2026-10-20T09:00", end: "2026-10-20T10:00", allDay: false, place: "X" }, { freq: "weekly", every: 2, until: "" }, { color: "#ff8800" }));
  assert.deepEqual(e, { alert: 10, title: "A", start: "2026-10-20T09:00", end: "2026-10-20T10:00", allDay: false, place: "X", repeat: { freq: "weekly", every: 2, until: "" }, color: "#ff8800" });
  const kept = plain(Sync.localEvent({ id: "x", alert: 30, detail: "notes", title: "Old" }, { title: "New", start: "2026-10-20", end: "2026-10-20", allDay: true, place: "" }, null));
  assert.equal(kept.alert, 30);
  assert.equal(kept.detail, "notes");
  assert.equal(kept.repeat, null);
});

check("PKCE: SHA-256 as everyone's, base64url", () => {
  for (const t of ["", "abc", "x".repeat(64), "x".repeat(200)]) {
    const want = crypto.createHash("sha256").update(t).digest("base64url");
    assert.equal(Sync.base64url(Sync.sha256(t)), want, t.length + " characters");
  }
  const p = Sync.pkce();
  assert.equal(p.verifier.length, 64);
  assert.equal(p.challenge, crypto.createHash("sha256").update(p.verifier).digest("base64url"));
});

check("the sign-in's answer", () => {
  assert.deepEqual(plain(Sync.callback("/?state=s1&code=4%2F0Ab_x&scope=a+b")), { code: "4/0Ab_x", state: "s1", error: "" });
  assert.deepEqual(plain(Sync.callback("/?error=access_denied&state=s1")), { code: "", state: "s1", error: "access_denied" });
  assert.equal(Sync.form({ a: "x y", b: "ü&" }), "a=x%20y&b=%C3%BC%26");
});

check("[fork] the synced calendars' events kept on this computer, Here only in calendar.json", () => {
  const cal = { version: 1, events: [ev("h", "Here", "2026-10-20T09:00", "2026-10-20T10:00"), ev("o", "Outlook", "2026-10-21T09:00", "2026-10-21T10:00"),
    ev("n", "New", "2026-10-22T09:00", "2026-10-22T10:00"), ev("m", "Moved", "2026-10-23T09:00", "2026-10-23T10:00")] };
  const where = { assigned: { m: "local" }, linked: { o: "o365:k", m: "o365:k" }, shared: { h: true }, fallback: "o365:k" };
  const p = plain(Sync.splitCalendar(cal, where));
  assert.deepEqual(p.shared.events.map((e) => e.id), ["h", "m"]);
  assert.deepEqual(p.cached.map((e) => e.id), ["o", "n"]);
  assert.equal(Sync.calendarOfEvent("h", where), "local");
  assert.equal(Sync.calendarOfEvent("n", where), "o365:k");
  assert.equal(Sync.calendarOfEvent("n", Object.assign({}, where, { fallback: "" })), "local");
  // (Linked wins over calendar.json: an event given a calendar leaves it.)
  assert.equal(Sync.calendarOfEvent("x", { linked: { x: "google:primary" }, shared: { x: true } }), "google:primary");
  const back = plain(Sync.mergeCalendar(p.shared, p.cached));
  assert.deepEqual(back.events.map((e) => e.id).sort(), ["h", "m", "n", "o"]);
  assert.equal(plain(Sync.mergeCalendar(p.shared, p.shared.events.concat(p.cached))).events.length, 4);
});

check("[fork] the first time: moved (the computer that synced) or afresh (another)", () => {
  const cal = { version: 1, events: [ev("h", "Here", "2026-10-20T09:00", "2026-10-20T10:00"), ev("o", "Outlook", "2026-10-21T09:00", "2026-10-21T10:00"),
    ev("n", "Not yet sent", "2026-10-22T09:00", "2026-10-22T10:00"), ev("g", "Given", "2026-10-23T09:00", "2026-10-23T10:00")] };
  const o = { assigned: { h: "local", g: "google:x" }, linked: { o: "o365:k" }, fallback: "o365:k" };
  const moved = plain(Sync.firstSplit(cal, o, "move"));
  assert.deepEqual(moved.shared.events.map((e) => e.id), ["h"]);
  assert.deepEqual(moved.cached.map((e) => e.id), ["o", "n", "g"]);
  const fresh = plain(Sync.firstSplit(cal, o, "fresh"));
  assert.deepEqual(fresh.shared.events.map((e) => e.id), ["h", "n"]);
  assert.deepEqual(fresh.cached, []);
});

console.log(`sync: ${passed} checks passed`);
