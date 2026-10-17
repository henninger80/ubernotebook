#!/usr/bin/env python3
# The Office 365 sync (fork): bin/uber-notebook-o365 against a calendar and
# an Office 365 kept in memory, in a state folder of its own: what's new,
# changed or gone on either side goes to the other; the safety guard; the
# profile it's for; one run at a time.
# Usage (from the plugin directory): python3 -I tests/o365.test.py
import fcntl, importlib.machinery, importlib.util, json, os, shutil, sys, tempfile

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
loader = importlib.machinery.SourceFileLoader("o365", os.path.join(root, "bin", "uber-notebook-o365"))
spec = importlib.util.spec_from_loader("o365", loader)
o = importlib.util.module_from_spec(spec)
loader.exec_module(o)

o.log = lambda *a: None
state = tempfile.mkdtemp(prefix="o365-test-")
o.STATE_DIR = state
for name in ("TOKEN_FILE", "MAP_FILE", "CONFIG_FILE", "LAST_FILE", "PENDING_FILE", "LOCK_FILE"):
    setattr(o, name, os.path.join(state, os.path.basename(getattr(o, name))))

passed = 0


def check(name, fn):
    global passed
    fn()
    passed += 1


class World:
    """The Notebook's calendar and Office 365's, as the script sees them."""

    def __init__(self):
        self.nb, self.g, self.n = {}, {}, 0
        self.profile = {"id": "p-1", "name": "Arbeit", "open": True, "demo": False}

    def new_id(self, kind):
        self.n += 1
        return f"{kind}-{self.n}"

    def notebook(self, *args):
        cmd, a = args[0], list(args[1:])
        if cmd == "profiles":
            return [self.profile]
        if cmd == "events":
            return {"events": [dict(e) for e in self.nb.values()]}
        if cmd == "addEvent":
            eid = self.new_id("nb")
            self.nb[eid] = {"id": eid, "title": "x", "start": "2026-10-20T12:00", "end": "2026-10-20T13:00",
                            "allDay": False, "place": "", "repeats": bool(a[1])}
            return {"ok": True, "id": eid}
        if cmd == "editEvent":
            eid, field, value = a
            e = self.nb[eid]
            e[field] = (value == "true") if field == "allDay" else value
            return {"ok": True}
        if cmd == "removeEvent":
            del self.nb[a[0]]
            return {"ok": True}
        raise AssertionError(cmd)

    def graph(self, method, path, data=None, extra=None):
        if method == "GET":
            return {"value": [dict(g) for g in self.g.values()]}
        if method == "POST":
            gid = self.new_id("g")
            self.g[gid] = self.g_event(gid, data["subject"], data["start"]["dateTime"][:16], data["end"]["dateTime"][:16])
            return {"id": gid}
        gid = path.rsplit("/", 1)[1]
        if method == "PATCH":
            self.g[gid]["subject"] = data["subject"]
            return {}
        if method == "DELETE":
            del self.g[gid]
            return {}
        raise AssertionError(method)

    @staticmethod
    def g_event(gid, title, start, end, modified="2020-01-01T00:00:00Z"):
        return {"id": gid, "subject": title, "isAllDay": False, "type": "singleInstance",
                "start": {"dateTime": start + ":00.0000000"}, "end": {"dateTime": end + ":00.0000000"},
                "location": {"displayName": ""}, "lastModifiedDateTime": modified}

    def nb_event(self, title, start, end):
        eid = self.new_id("nb")
        self.nb[eid] = {"id": eid, "title": title, "start": start, "end": end, "allDay": False, "place": "", "repeats": False}
        return eid


def fresh():
    for f in os.listdir(state):
        os.remove(os.path.join(state, f))
    w = World()
    o.nb, o.graph = w.notebook, w.graph
    return w


def day(n):
    from datetime import date, timedelta
    return (date.today() + timedelta(days=n)).isoformat()


def both_ways():
    w = fresh()
    w.g["g-a"] = w.g_event("g-a", "Kickoff", day(3) + "T09:00", day(3) + "T10:00")
    w.nb_event("Dentist", day(4) + "T15:00", day(4) + "T16:00")
    stats = o.sync(False)
    assert stats["to_nb"] == 1 and stats["to_g"] == 1, stats
    titles = sorted(e["title"] for e in w.nb.values())
    assert titles == ["Dentist", "Kickoff"], titles
    kick = [e for e in w.nb.values() if e["title"] == "Kickoff"][0]
    assert kick["start"] == day(3) + "T09:00" and kick["end"] == day(3) + "T10:00", kick
    assert sorted(g["subject"] for g in w.g.values()) == ["Dentist", "Kickoff"]
    again = o.sync(False)
    assert sum(again.values()) == 0, again
    assert json.load(open(o.CONFIG_FILE))["profile"] == "p-1", "the profile first synced is kept"


def changes_and_deletions():
    w = fresh()
    w.g["g-a"] = w.g_event("g-a", "Kickoff", day(3) + "T09:00", day(3) + "T10:00")
    w.g["g-b"] = w.g_event("g-b", "Review", day(5) + "T09:00", day(5) + "T10:00")
    o.sync(False)
    w.g["g-a"]["subject"] = "Kickoff (moved)"
    nb_review = [k for k, e in w.nb.items() if e["title"] == "Review"][0]
    del w.nb[nb_review]
    stats = o.sync(False)
    assert stats["upd_nb"] == 1 and stats["del_g"] == 1, stats
    assert "g-b" not in w.g
    assert [e["title"] for e in w.nb.values()] == ["Kickoff (moved)"]


def the_safety_guard():
    w = fresh()
    for i in range(8):
        w.g[f"g-{i}"] = w.g_event(f"g-{i}", f"E{i}", day(i + 1) + "T09:00", day(i + 1) + "T10:00")
    o.sync(False)
    w.nb.clear()
    try:
        o.sync(False)
    except o.Failure as e:
        assert "safety guard" in str(e)
    else:
        raise AssertionError("everything gone at once must stop the sync")
    assert len(w.g) == 8, "nothing deleted in Office 365"


def another_profile_waits():
    w = fresh()
    o.sync(False)
    w.profile = {"id": "p-2", "name": "Privat", "open": True, "demo": False}
    w.g["g-a"] = w.g_event("g-a", "Kickoff", day(3) + "T09:00", day(3) + "T10:00")
    try:
        o.sync(False)
    except o.Failure as e:
        assert "Privat" in str(e)
    else:
        raise AssertionError("another profile must not be synced")
    assert not w.nb


def one_run_at_a_time():
    fresh()
    with open(o.LOCK_FILE, "w") as held:
        fcntl.flock(held, fcntl.LOCK_EX)
        assert o.run_sync(False, False) == 3


def a_failure_is_kept_for_settings():
    w = fresh()
    def offline(*a, **k):
        raise o.Failure("Office 365 isn't reachable (no network)")
    o.graph = offline
    assert o.run_sync(False, False) == 2
    last = json.load(open(o.LAST_FILE))
    assert last["ok"] is False and "reachable" in last["error"], last


def settings():
    fresh()
    assert o.load_config() == {"enabled": True, "interval": 10, "profile": ""}
    o.set_config("enabled", "false")
    o.set_config("interval", "1")
    c = o.load_config()
    assert c["enabled"] is False and c["interval"] == 5, c


def all_day_both_ways():
    n = {"title": "Trip", "start": "2026-11-02", "end": "2026-11-04", "allDay": True, "place": "Lisbon"}
    body = o.g_body(n)
    assert body["start"]["dateTime"] == "2026-11-02T00:00:00" and body["end"]["dateTime"] == "2026-11-05T00:00:00"
    g = {"subject": "Trip", "isAllDay": True, "start": {"dateTime": body["start"]["dateTime"]},
         "end": {"dateTime": body["end"]["dateTime"]}, "location": {"displayName": "Lisbon"}}
    assert o.g_norm(g) == n


def repeats():
    weekly = {"recurrence": {"pattern": {"type": "weekly", "interval": 1, "daysOfWeek": ["monday"]}}}
    weekdays = {"recurrence": {"pattern": {"type": "weekly", "interval": 1, "daysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"]}}}
    fortnight = {"recurrence": {"pattern": {"type": "weekly", "interval": 2, "daysOfWeek": ["monday"]}}}
    assert o.g_repeat(weekly) == "weekly" and o.g_repeat(weekdays) == "weekdays" and o.g_repeat(fortnight) is None
    assert o.g_repeat({}) == ""


check("new events go both ways, once", both_ways)
check("a change comes in, a deletion goes out", changes_and_deletions)
check("everything gone at once stops it", the_safety_guard)
check("another profile open: it waits", another_profile_waits)
check("one run at a time", one_run_at_a_time)
check("a failure kept for Settings", a_failure_is_kept_for_settings)
check("settings, within their range", settings)
check("all-day events: Office 365's end is the day after", all_day_both_ways)
check("repeats the calendar has, and those it hasn't", repeats)
shutil.rmtree(state)
print(f"o365: {passed} passed")
