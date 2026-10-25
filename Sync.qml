import QtQuick
import "Sync.js" as Sync
import "Calendar.js" as Calendar

// The calendar kept the same as Office 365's and Google's (fork), both ways,
// here in the service: the accounts and signing in to them, their calendars
// (which are synced, the default one for events made here, the one each
// event is given), asking them over HTTPS, and the changes Sync.js plans
// made on our calendar (as one change a calendar: Ctrl+Z takes it back) and
// there. It syncs every few minutes, and a little after the calendar's
// changed here.
//
// What it keeps is in ~/.local/state/uber-notebook-sync, yours alone:
// config.json (the settings and calendars), links.json (which event is
// which), assign.json (the calendar each event made here was given),
// tokens-<account>.json (the sign-ins) and last.json (how the last sync
// went). The first time, what bin/o365-calendar-sync kept in
// ~/.local/state/o365-sync is taken over (and left there).
Item {
  id: sync

  // Store.qml: files to read (readNow) and write (writeFile), programs
  // (exec), pages to open (openUrl).
  property var files: null
  property var workspace: null
  // The profile open ({ id, name, demo }): only the one synced first is synced.
  property var profile: null
  property string home: ""
  // The pages are loaded.
  property bool ready: false

  readonly property string dir: home ? home + "/.local/state/uber-notebook-sync" : ""
  readonly property string oldDir: home ? home + "/.local/state/o365-sync" : ""

  readonly property string msClient: "14d82eec-204b-4c2f-b7e8-296a70dab67e" // Microsoft Graph CLI's, for everyone
  readonly property string msLogin: "https://login.microsoftonline.com/common/oauth2/v2.0"
  readonly property string msScope: "Calendars.ReadWrite offline_access"
  readonly property string graph: "https://graph.microsoft.com/v1.0"
  readonly property string googleAuth: "https://accounts.google.com/o/oauth2/v2/auth"
  readonly property string googleToken: "https://oauth2.googleapis.com/token"
  readonly property string googleScope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks"
  readonly property string gcal: "https://www.googleapis.com/calendar/v3"

  // ---- what's kept ----
  property var config: ({ enabled: true, interval: 10, profile: "", defaultCal: "", google: { clientId: "", clientSecret: "" }, calendars: {} })
  property var links: []
  property var lastSync: ({})
  property var assigned: ({})
  property var tokens: ({})
  property var last: null
  property bool loaded: false
  property int revision: 0
  // The computer's time zone ("Europe/Berlin"), as the services are told.
  property string tz: ""

  // ---- as it goes ----
  property bool running: false
  property string phase: ""
  // Signing in, per account: { code, uri } (Office 365's code), { waiting } (Google's page), problem.
  property var signing: ({})

  readonly property bool signedInMs: !!(tokens.o365 && tokens.o365.refresh_token)
  readonly property bool signedInGoogle: !!(tokens.google && tokens.google.refresh_token)
  readonly property bool googleClient: !!(config.google && config.google.clientId && config.google.clientSecret)
  readonly property bool syncOn: config.enabled === true
  readonly property int interval: Math.max(5, Math.min(240, Number(config.interval) || 10))

  // The calendars, for Settings and the event's choice: [{ key, provider,
  // name, color, on, writable, primary, isDefault }], Office 365's first.
  readonly property var calendars: {
    var r = revision
    var list = []
    var cals = config.calendars || {}
    Object.keys(cals).forEach(function(k) {
      var c = cals[k]
      list.push({ key: k, provider: c.provider, name: c.name, color: c.color || "", on: c.on === true, writable: c.writable !== false,
                  primary: c.primary === true, isDefault: config.defaultCal === k })
    })
    list.sort(function(a, b) {
      if (a.provider !== b.provider) return a.provider === "o365" ? -1 : 1
      if (a.primary !== b.primary) return a.primary ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return list
  }

  function path(name) { return dir + "/" + name }
  function readJson(p, fallback) {
    var t = files ? files.readNow(p, 8 * 1024 * 1024) : null
    if (t === null || t === undefined || t === "") return fallback
    try { return JSON.parse(t) } catch (e) { return fallback }
  }
  function writeJson(name, value) { if (files && dir) files.writeFile(path(name), JSON.stringify(value, null, 1), null, true) }
  function saveConfig() { revision++; writeJson("config.json", config) }
  // [fork] Google and Office 365 straight: the pairs of events ({ o, g, fp, title, start }).
  property var bridgeLinks: []
  property var bridgeLast: 0
  readonly property bool bridgeOn: !!(config.bridge && config.bridge.on === true)
  function saveBridge() { writeJson("bridge.json", { version: 1, links: bridgeLinks, last: bridgeLast }) }
  function saveLinks() { writeJson("links.json", { version: 1, links: links, last: lastSync }) }
  function saveAssigned() { revision++; writeJson("assign.json", assigned) }
  function saveTokens(account) { writeJson("tokens-" + account + ".json", tokens[account] || {}) }
  function setConfig(changes) {
    var c = JSON.parse(JSON.stringify(config))
    for (var k in changes) c[k] = changes[k]
    config = c
    saveConfig()
  }

  property bool loading: false
  function load() {
    if (loaded || loading || !files || !dir) return
    loading = true
    files.exec(files.privateMkdir([dir]), function() { sync.loading = false; sync.loadNow() })
  }
  function loadNow() {
    var c = readJson(path("config.json"), null)
    var l = readJson(path("links.json"), null)
    var t = {}
    ;["o365", "google"].forEach(function(a) { var x = readJson(path("tokens-" + a + ".json"), null); if (x && x.refresh_token) t[a] = x })
    if (!c && !l) {
      // (The first time: what the script kept, taken over.)
      var old = readJson(oldDir + "/map.json", null)
      var oldTok = readJson(oldDir + "/token.json", null)
      var oldCfg = readJson(oldDir + "/config.json", {})
      c = { enabled: oldCfg.enabled !== false, interval: Number(oldCfg.interval) || 10, profile: oldCfg.profile || "", defaultCal: old ? "o365:@default" : "",
            google: { clientId: "", clientSecret: "" }, calendars: {} }
      if (old && Array.isArray(old.links)) {
        l = { version: 1, last: { "o365:@default": Math.round((old.last_sync || 0) * 1000) },
              links: old.links.map(function(x) { return { nb: x.nb, cal: "o365:@default", rid: x.g, fp: "", title: x.title, start: x.start, recurring: !!x.recurring } }) }
        c.calendars["o365:@default"] = { provider: "o365", id: "@default", name: "Calendar", color: "", on: true, writable: true, primary: true }
      }
      if (oldTok && oldTok.refresh_token)
        t.o365 = { access_token: oldTok.access_token, refresh_token: oldTok.refresh_token, expires_at: Math.round(((oldTok.obtained || 0) + (oldTok.expires_in || 0)) * 1000) }
    }
    config = c || config
    if (!config.calendars) config.calendars = {}
    if (!config.google) config.google = { clientId: "", clientSecret: "" }
    links = l && Array.isArray(l.links) ? l.links : []
    lastSync = l && l.last ? l.last : {}
    assigned = readJson(path("assign.json"), {}) || {}
    var b = readJson(path("bridge.json"), null)
    bridgeLinks = b && Array.isArray(b.links) ? b.links : []
    bridgeLast = b && b.last ? b.last : 0
    tokens = t
    last = readJson(path("last.json"), null)
    loaded = true
    files.exec(["/usr/bin/readlink", "-f", "/etc/localtime"], function(ok, out) {
      var m = /zoneinfo\/(.+)$/.exec(String(out || "").trim())
      sync.tz = m ? m[1] : "UTC"
    })
    saveConfig()
    saveLinks()
    if (t.o365) saveTokens("o365")
    revision++
  }

  // ---- HTTPS ----

  property var pending: []
  // (Tests answer for the services: transport(method, url, o, done).)
  property var transport: null
  function request(method, url, o, done) {
    if (transport) { transport(method, url, o, done); return }
    var x = new XMLHttpRequest()
    var entry = { x: x, at: Date.now(), over: false }
    entry.finish = function(status, json, text) {
      if (entry.over) return
      entry.over = true
      sync.pending = sync.pending.filter(function(p) { return p !== entry })
      done(status, json, text)
    }
    pending = pending.concat([entry])
    x.onreadystatechange = function() {
      if (x.readyState !== 4) return
      var json = null
      try { json = x.responseText ? JSON.parse(x.responseText) : {} } catch (e) { json = null }
      entry.finish(x.status, json, x.responseText || "")
    }
    x.open(method, url)
    var h = o.headers || {}
    for (var k in h) x.setRequestHeader(k, h[k])
    if (o.form) { x.setRequestHeader("Content-Type", "application/x-www-form-urlencoded"); x.send(Sync.form(o.form)) }
    else if (o.json !== undefined) { x.setRequestHeader("Content-Type", "application/json"); x.send(JSON.stringify(o.json)) }
    else x.send()
  }
  // (A minute for each, then it's given up: status 0.)
  Timer {
    interval: 2000
    repeat: true
    running: sync.pending.length > 0
    onTriggered: {
      var now = Date.now()
      sync.pending.slice().forEach(function(p) {
        if (now - p.at <= 60000) return
        p.x.onreadystatechange = null
        try { p.x.abort() } catch (e) {}
        p.finish(0, null, "")
      })
    }
  }

  function why(status, json, text) {
    if (status === 0) return "no answer (offline?)"
    var e = json && json.error
    if (e && typeof e === "object") return status + " " + (e.message || e.code || "")
    if (json && json.error_description) return json.error_description
    return status + " " + String(text || "").slice(0, 160)
  }

  // A sign-in's token, renewed when it's run out: done(token, problem).
  function token(account, done) {
    var t = tokens[account]
    if (!t || !t.refresh_token) { done("", "not signed in"); return }
    if (t.access_token && Date.now() < (t.expires_at || 0) - 120000) { done(t.access_token, ""); return }
    var form = account === "o365"
      ? { grant_type: "refresh_token", client_id: msClient, refresh_token: t.refresh_token, scope: msScope }
      : { grant_type: "refresh_token", client_id: config.google.clientId, client_secret: config.google.clientSecret, refresh_token: t.refresh_token }
    request("POST", account === "o365" ? msLogin + "/token" : googleToken, { form: form }, function(status, json, text) {
      if (status !== 200 || !json || !json.access_token) {
        done("", status === 400 || status === 401 ? "the sign-in has run out: sign in again" : why(status, json, text))
        return
      }
      sync.keepToken(account, json, t.refresh_token)
      done(json.access_token, "")
    })
  }
  function keepToken(account, json, refresh) {
    var t = {}
    for (var k in tokens) t[k] = tokens[k]
    t[account] = { access_token: json.access_token, refresh_token: json.refresh_token || refresh, expires_at: Date.now() + (Number(json.expires_in) || 3600) * 1000 }
    tokens = t
    saveTokens(account)
  }

  // A request to an account's service: done(ok, json, problem).
  function api(account, method, url, body, done) {
    token(account, function(tok, problem) {
      if (!tok) { done(false, null, problem); return }
      var h = { Authorization: "Bearer " + tok }
      if (account === "o365") h.Prefer = "outlook.timezone=\"" + sync.tz + "\", outlook.body-content-type=\"text\""
      var o = { headers: h }
      if (body !== undefined && body !== null) o.json = body
      sync.request(method, url, o, function(status, json, text) {
        if (status >= 200 && status < 300) done(true, json || {}, "")
        else done(false, json, why(status, json, text))
      })
    })
  }
  // Every page of a list: done(items, problem).
  function all(account, url, done, got) {
    var items = got || []
    api(account, "GET", url, null, function(ok, json, problem) {
      if (!ok) { done(null, problem); return }
      items = items.concat(json.value || json.items || [])
      if (json["@odata.nextLink"]) sync.all(account, json["@odata.nextLink"], done, items)
      else if (json.nextPageToken) sync.all(account, url.replace(/([?&])pageToken=[^&]*&?/, "$1").replace(/[?&]$/, "") + (url.indexOf("?") >= 0 ? "&" : "?") + "pageToken=" + encodeURIComponent(json.nextPageToken), done, items)
      else done(items, "")
    })
  }

  // ---- signing in ----

  function setSigning(account, value) {
    var s = {}
    for (var k in signing) s[k] = signing[k]
    s[account] = value
    signing = s
  }

  // Office 365: a code to type on Microsoft's page, then waiting for it.
  function signInMs() {
    if (signing.o365 && signing.o365.code) return
    setSigning("o365", { problem: "" })
    request("POST", msLogin + "/devicecode", { form: { client_id: msClient, scope: msScope } }, function(status, json, text) {
      if (status !== 200 || !json || !json.device_code) { sync.setSigning("o365", { problem: "couldn't start: " + sync.why(status, json, text) }); return }
      sync.setSigning("o365", { code: json.user_code, uri: json.verification_uri, device: json.device_code, until: Date.now() + json.expires_in * 1000, every: (json.interval || 5) * 1000 })
      if (sync.files) sync.files.openUrl(json.verification_uri)
      msPoll.interval = (json.interval || 5) * 1000
      msPoll.start()
    })
  }
  Timer {
    id: msPoll
    repeat: false
    onTriggered: {
      var s = sync.signing.o365
      if (!s || !s.device) return
      if (Date.now() > s.until) { sync.setSigning("o365", { problem: "the code ran out: sign in again" }); return }
      sync.request("POST", sync.msLogin + "/token", { form: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: sync.msClient, device_code: s.device } }, function(status, json) {
        if (json && json.access_token) {
          sync.keepToken("o365", json, "")
          sync.setSigning("o365", null)
          sync.calendarsOf("o365", function() { sync.syncSoon() })
          return
        }
        var e = json ? json.error : ""
        if (e === "authorization_pending" || e === "slow_down") { if (e === "slow_down") msPoll.interval += 5000; msPoll.start(); return }
        sync.setSigning("o365", { problem: "sign-in failed: " + (json && json.error_description ? json.error_description.split("\r")[0] : status) })
      })
    }
  }
  function cancelSignIn(account) { if (account === "o365") msPoll.stop(); setSigning(account, null) }

  // Google: its page in the browser, which sends you back to this computer
  // (127.0.0.1, a port of its own), where a small listener, started for it
  // and gone after, hears the answer.
  readonly property string listener: "import socket,sys\n" +
    "port,state=int(sys.argv[1]),sys.argv[2]\n" +
    "s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(('127.0.0.1',port)); s.listen(4); s.settimeout(600)\n" +
    "while True:\n" +
    "  c,_=s.accept(); c.settimeout(10)\n" +
    "  try: line=c.recv(8192).decode('latin-1').split('\\r\\n')[0]\n" +
    "  except Exception: c.close(); continue\n" +
    "  p=line.split(' ')[1] if line.count(' ')>=2 else ''\n" +
    "  ok=('state='+state) in p\n" +
    "  body=('Signed in to Google. You can close this tab and go back to Uber Notebook.' if ok and 'code=' in p else 'Uber Notebook: the sign-in did not go through. You can close this tab.') if ok else 'Not found'\n" +
    "  c.sendall(('HTTP/1.1 '+('200 OK' if ok else '404 Not Found')+'\\r\\nContent-Type: text/plain; charset=utf-8\\r\\nConnection: close\\r\\n\\r\\n'+body).encode()); c.close()\n" +
    "  if ok: print(p); break\n"

  function signInGoogle() {
    if (!googleClient) { setSigning("google", { problem: "the client ID and secret first (from Google Cloud)" }); return }
    if (signing.google && signing.google.waiting) return
    var port = 40000 + Math.floor(Math.random() * 20000)
    var state = Sync.randomText(24)
    var p = Sync.pkce()
    var redirect = "http://127.0.0.1:" + port
    setSigning("google", { waiting: true, problem: "" })
    files.exec(["/usr/bin/python3", "-I", "-c", listener, String(port), state], function(ok, out) {
      var got = Sync.callback(String(out || "").trim().split("\n").pop())
      if (!ok || got.state !== state) { sync.setSigning("google", { problem: ok ? "the answer didn't match: sign in again" : "no answer from Google's page (it waits 10 minutes)" }); return }
      if (got.error || !got.code) { sync.setSigning("google", { problem: "Google said: " + (got.error || "no code") }); return }
      sync.request("POST", sync.googleToken, { form: { grant_type: "authorization_code", code: got.code, client_id: sync.config.google.clientId,
          client_secret: sync.config.google.clientSecret, redirect_uri: redirect, code_verifier: p.verifier } }, function(status, json, text) {
        if (status !== 200 || !json || !json.refresh_token) { sync.setSigning("google", { problem: "sign-in failed: " + sync.why(status, json, text) }); return }
        sync.keepToken("google", json, "")
        sync.setSigning("google", null)
        sync.calendarsOf("google", function() { sync.syncSoon() })
      })
    }, { timeoutMs: 660000, maxBytes: 16384 })
    // (The listener a moment to start, then the page.)
    googleOpen.url = googleAuth + "?" + Sync.query({ client_id: config.google.clientId, redirect_uri: redirect, response_type: "code", scope: googleScope,
      access_type: "offline", prompt: "consent", state: state, code_challenge: p.challenge, code_challenge_method: "S256" })
    googleOpen.start()
  }
  Timer { id: googleOpen; property string url: ""; interval: 600; onTriggered: if (sync.files) sync.files.openUrl(url) }

  function signOut(account) {
    var t = {}
    for (var k in tokens) if (k !== account) t[k] = tokens[k]
    tokens = t
    writeJson("tokens-" + account + ".json", {})
    revision++
  }

  function setGoogleClient(id, secret) {
    var c = JSON.parse(JSON.stringify(config))
    c.google = { clientId: String(id || "").trim(), clientSecret: String(secret || "").trim() }
    config = c
    saveConfig()
  }

  // ---- calendars ----

  // An account's calendars, asked again (the new ones off but its main one):
  // done(problem).
  function calendarsOf(account, done) {
    var url = account === "o365" ? graph + "/me/calendars?$select=id,name,hexColor,isDefaultCalendar,canEdit&$top=100"
                                 : gcal + "/users/me/calendarList?maxResults=250"
    all(account, url, function(items, problem) {
      if (!items) { if (done) done(problem); return }
      var c = JSON.parse(JSON.stringify(sync.config))
      var seen = {}
      items.forEach(function(it) {
        var main = account === "o365" ? it.isDefaultCalendar === true : it.primary === true
        var key = account + ":" + (account === "google" && main ? "primary" : it.id)
        // (The calendar the script synced: Office 365's default one.)
        if (account === "o365" && main && c.calendars["o365:@default"]) sync.rekey(c, "o365:@default", key)
        seen[key] = true
        var was = c.calendars[key]
        c.calendars[key] = {
          provider: account, id: account === "google" && main ? "primary" : it.id,
          name: account === "o365" ? it.name : (it.summaryOverride || it.summary || it.id),
          color: was && was.ownColor ? was.color : (account === "o365" ? (it.hexColor || "") : (it.backgroundColor || "")),
          ownColor: !!(was && was.ownColor),
          on: was ? was.on === true : main,
          writable: account === "o365" ? it.canEdit !== false : (it.accessRole === "owner" || it.accessRole === "writer"),
          primary: main
        }
      })
      // (Gone there: gone from the list, its links too.)
      Object.keys(c.calendars).forEach(function(k) {
        if (k.indexOf(account + ":") === 0 && !seen[k]) delete c.calendars[k]
      })
      if (!c.defaultCal) Object.keys(c.calendars).forEach(function(k) { if (!c.defaultCal && c.calendars[k].primary && c.calendars[k].writable) c.defaultCal = k })
      sync.config = c
      sync.saveConfig()
      if (done) done("")
    })
  }
  // (A calendar's key changed: its links, events given to it and the default with it.)
  function rekey(c, from, to) {
    c.calendars[to] = c.calendars[from]
    delete c.calendars[from]
    if (c.defaultCal === from) c.defaultCal = to
    links = links.map(function(l) { if (l.cal === from) l.cal = to; return l })
    if (lastSync[from] !== undefined) { lastSync[to] = lastSync[from]; delete lastSync[from] }
    var a = {}
    for (var k in assigned) a[k] = assigned[k] === from ? to : assigned[k]
    assigned = a
    saveLinks()
    saveAssigned()
  }

  // A calendar synced or not. Off, its events leave our calendar (they're
  // its; they come back when it's on again).
  function setCalendarOn(key, on) {
    var c = JSON.parse(JSON.stringify(config))
    if (!c.calendars[key]) return
    c.calendars[key].on = on
    if (!on && c.defaultCal === key) c.defaultCal = ""
    config = c
    saveConfig()
    if (on) { syncSoon(); return }
    var mine = links.filter(function(l) { return l.cal === key })
    if (mine.length && workspace) {
      var cal = workspace.calendar
      mine.forEach(function(l) { cal = Calendar.without(cal, l.nb) })
      applying = true
      workspace.setCalendar(cal)
      applying = false
    }
    links = links.filter(function(l) { return l.cal !== key })
    delete lastSync[key]
    saveLinks()
  }
  function setDefault(key) { setConfig({ defaultCal: key }) }
  function setCalendarColor(key, color) {
    var c = JSON.parse(JSON.stringify(config))
    if (!c.calendars[key]) return
    c.calendars[key].color = color
    c.calendars[key].ownColor = true
    config = c
    saveConfig()
  }

  // The calendar an event of ours is in, or goes to: a key, or "local".
  function calendarOf(nb) {
    var r = revision
    if (assigned[nb]) return assigned[nb]
    for (var i = 0; i < links.length; i++) if (links[i].nb === nb) return links[i].cal
    return config.defaultCal || Sync.LOCAL
  }
  // An event given to a calendar (or kept here: "local"): moved at the next sync.
  function setCalendarOf(nb, key) {
    var a = {}
    for (var k in assigned) a[k] = assigned[k]
    a[nb] = key
    assigned = a
    saveAssigned()
    syncSoon()
  }

  // ---- syncing ----

  property bool applying: false
  property var stats: ({})
  property var problems: []

  function syncSoon() { soon.restart() }
  Timer { id: soon; interval: 3000; onTriggered: sync.syncNow() }

  // A change on our calendar (not the sync's): synced in a little while.
  Connections {
    target: sync.workspace
    function onCalendarRevisionChanged() { if (!sync.applying && sync.ready && sync.syncOn && !sync.running) afterChange.restart() }
  }
  Timer { id: afterChange; interval: 20000; onTriggered: sync.syncNow() }

  Timer {
    interval: sync.interval * 60000
    repeat: true
    running: sync.ready && sync.syncOn && (sync.signedInMs || sync.signedInGoogle)
    onTriggered: sync.syncNow()
  }
  Timer {
    interval: 120000
    running: sync.ready && sync.syncOn && (sync.signedInMs || sync.signedInGoogle)
    onTriggered: sync.syncNow()
  }

  function finish(ok, error) {
    running = false
    phase = ""
    last = { at: Date.now(), ok: ok && problems.length === 0, error: error || problems.slice(0, 3).join("; "), stats: stats }
    writeJson("last.json", last)
  }

  function syncNow() {
    if (running || !ready || !loaded || !workspace) return
    if (!profile) return
    if (profile.demo) { last = { at: Date.now(), ok: false, error: "the demo profile is open: not synced" }; return }
    if (!config.profile) setConfig({ profile: profile.id })
    else if (config.profile !== profile.id) { last = { at: Date.now(), ok: false, error: "profile “" + profile.name + "” is open, not the synced one: waiting" }; return }
    if (!tz) { syncSoon(); return }
    running = true
    stats = { in: 0, out: 0, gone: 0 }
    problems = []
    var accounts = []
    if (signedInMs) accounts.push("o365")
    if (signedInGoogle && googleClient) accounts.push("google")
    if (!accounts.length) { finish(false, "not signed in"); return }
    var steps = []
    accounts.forEach(function(a) {
      steps.push(function(next) {
        sync.phase = "Calendars"
        sync.calendarsOf(a, function(problem) { if (problem) sync.problems = sync.problems.concat([(a === "o365" ? "Office 365" : "Google") + ": " + problem]); next() })
      })
    })
    steps.push(function(next) {
      var cals = sync.calendars.filter(function(c) { return c.on && accounts.indexOf(c.provider) >= 0 && c.key.indexOf("@default") < 0 })
      var each = cals.map(function(c) { return function(go) { sync.syncCalendar(c, go) } })
      sync.series(each, next)
    })
    if (bridgeOn && accounts.length === 2) steps.push(function(next) { sync.syncBridge(next) })
    series(steps, function() { sync.finish(true, "") })
  }

  function series(steps, done) {
    var i = 0
    function next() {
      if (i >= steps.length) { done(); return }
      var s = steps[i++]
      try { s(next) } catch (e) { sync.problems = sync.problems.concat(["" + e]); next() }
    }
    next()
  }

  // One calendar elsewhere: its events asked for, the plan, the changes made.
  function syncCalendar(c, done) {
    var meta = config.calendars[c.key]
    phase = c.name
    fetchRemote(c, meta, function(remote, problem) {
      if (!remote) { sync.problems = sync.problems.concat([c.name + ": " + problem]); done(); return }
      var mine = sync.links.filter(function(l) { return l.cal === c.key })
      var elsewhere = {}
      sync.links.forEach(function(l) { if (l.cal !== c.key) elsewhere[l.nb] = true })
      var p = Sync.plan({ cal: c.key, remote: remote, links: mine, local: sync.workspace.calendar.events, linkedElsewhere: elsewhere,
        assigned: sync.assigned, fallback: sync.config.defaultCal || Sync.LOCAL, last: sync.lastSync[c.key] || 0, now: new Date() })
      if (p.refused) { sync.problems = sync.problems.concat([c.name + ": stopped, " + (p.reason || (p.deletions + " of " + mine.length + " events gone at once (safety guard)"))]); done(); return }
      var kept = p.links
      // Ours first, as one change.
      var cal = sync.workspace.calendar
      var changed = false
      var made = []
      p.actions.forEach(function(a) {
        if (a.op === "localCreate") {
          var e = Calendar.cleanEvent(Sync.localEvent(null, a.n, a.repeat, c.color ? { color: Calendar.cleanColor(c.color) } : null))
          if (!e) return
          cal = Calendar.withEvent(cal, e)
          made.push({ nb: e.id, cal: c.key, rid: a.rid, fp: Sync.fp(a.n, a.repeat), title: a.n.title, start: a.n.start, recurring: !!a.repeat })
          sync.stats.in++
          changed = true
        } else if (a.op === "localUpdate") {
          var cur = Calendar.byId(cal, a.nb)
          var u = cur ? Calendar.cleanEvent(Sync.localEvent(cur, a.n, a.repeat)) : null
          if (u) { cal = Calendar.withEvent(cal, u); sync.stats.in++; changed = true }
        } else if (a.op === "localDelete") {
          cal = Calendar.without(cal, a.nb)
          sync.stats.gone++
          changed = true
        }
      })
      if (changed) {
        sync.applying = true
        sync.workspace.setCalendar(cal)
        sync.applying = false
      }
      var others = sync.links.filter(function(l) { return l.cal !== c.key })
      sync.links = others.concat(kept, made)
      sync.saveLinks()
      // Then theirs, one at a time (each new link kept as it's made).
      var remoteOps = p.actions.filter(function(a) { return a.op.indexOf("remote") === 0 })
      if (!c.writable) remoteOps = []
      var steps = remoteOps.map(function(a) { return function(next) { sync.remoteOp(c, meta, a, next) } })
      sync.series(steps, function() {
        var ls = {}
        for (var k in sync.lastSync) ls[k] = sync.lastSync[k]
        ls[c.key] = Date.now()
        sync.lastSync = ls
        sync.saveLinks()
        done()
      })
    })
  }

  // [fork] Google and Office 365 straight, behind the scenes: what one has
  // the other gets. Neither shows here (Google's calendar is off).
  // On: Google's main calendar leaves our calendar (it's off), and the two are kept the same behind the scenes.
  function setBridge(on) {
    var gkey = ""
    calendars.forEach(function(c) { if (c.provider === "google" && c.primary) gkey = c.key })
    if (on && gkey && config.calendars[gkey].on) setCalendarOn(gkey, false)
    setConfig({ bridge: { on: on } })
    if (on) syncSoon()
  }
  function syncBridge(done) {
    var cals = sync.calendars
    var co = null, cg = null
    cals.forEach(function(c) {
      if (c.provider === "o365" && c.primary) co = c
      if (c.provider === "google" && c.primary) cg = c
    })
    if (!co || !cg) { sync.problems = sync.problems.concat(["Google/Office 365: no main calendar"]); done(); return }
    phase = "Google ⇄ Office 365"
    fetchRemote(co, config.calendars[co.key], function(ro, p1) {
      if (!ro) { sync.problems = sync.problems.concat(["Office 365: " + p1]); done(); return }
      fetchRemote(cg, config.calendars[cg.key], function(rg, p2) {
        if (!rg) { sync.problems = sync.problems.concat(["Google: " + p2]); done(); return }
        var p = Sync.planBridge({ o365: ro, google: rg, links: sync.bridgeLinks, last: sync.bridgeLast, now: new Date() })
        if (p.refused) { sync.problems = sync.problems.concat(["Google ⇄ Office 365: stopped, " + p.reason]); done(); return }
        sync.bridgeLinks = p.links
        sync.saveBridge()
        var steps = p.actions.map(function(a) { return function(next) { sync.bridgeOp(co, cg, a, next) } })
        sync.series(steps, function() {
          sync.bridgeLast = Date.now()
          sync.saveBridge()
          done()
        })
      })
    })
  }

  function fetchRemote(c, meta, done, plain) {
    var now = new Date()
    var w = Sync.span(now)
    if (c.provider === "o365") {
      var base = graph + "/me/calendars/" + encodeURIComponent(meta.id)
      all("o365", base + "/events?$top=100&$select=id,subject,start,end,isAllDay,location,recurrence,type,lastModifiedDateTime,isCancelled", function(items, problem) {
        if (!items) { done(null, problem); return }
        var got = Sync.graphEvents(items, now)
        if (plain || !got.complex.length) { done(got.events, ""); return }
        all("o365", base + "/calendarView?" + Sync.query({ startDateTime: w[0] + "T00:00:00", endDateTime: w[1] + "T00:00:00", "$top": 100,
            "$select": "id,subject,start,end,isAllDay,location,type,lastModifiedDateTime,isCancelled,seriesMasterId" }), function(times, p2) {
          if (!times) { done(null, p2); return }
          done(Sync.graphTimes(times, got.complex, got.events), "")
        })
      })
    } else {
      var gbase = gcal + "/calendars/" + encodeURIComponent(meta.id) + "/events"
      var q = { timeMin: w[0] + "T00:00:00Z", timeMax: w[1] + "T00:00:00Z", maxResults: 2500, showDeleted: "false", singleEvents: "false", timeZone: tz }
      all("google", gbase + "?" + Sync.query(q), function(items, problem) {
        if (!items) { done(null, problem); return }
        var got = Sync.googleEvents(items, now)
        var into = got.events
        var each = (plain ? [] : got.complex).map(function(id) { return function(next) {
          sync.all("google", gbase + "/" + encodeURIComponent(id) + "/instances?" + Sync.query({ timeMin: q.timeMin, timeMax: q.timeMax, maxResults: 2500, timeZone: sync.tz }), function(times) {
            if (times) Sync.googleTimes(times, into)
            next()
          })
        } })
        sync.series(each, function() { done(into, "") })
      })
    }
  }

  function bridgeOp(co, cg, a, next) {
    var ob = graph + "/me/calendars/" + encodeURIComponent(config.calendars[co.key].id) + "/events"
    var gb = gcal + "/calendars/" + encodeURIComponent(config.calendars[cg.key].id) + "/events"
    function failed(problem) { sync.problems = sync.problems.concat(["Google ⇄ Office 365: “" + (a.title || "") + "”: " + problem]) }
    function gone(ok, json, problem) {
      if (ok || /^(404|410)/.test(problem)) sync.stats.out++
      else failed(problem)
      next()
    }
    function made(link) {
      return function(ok, json, problem) {
        if (ok && json.id) {
          sync.bridgeLinks = sync.bridgeLinks.concat([link(json.id)])
          sync.saveBridge()
          sync.stats.out++
        } else failed(problem)
        next()
      }
    }
    var f = Sync.fp(a.n, null)
    if (a.op === "createG") api("google", "POST", gb, Sync.googleBody(a.n, tz), made(function(id) { return { o: a.rid, g: id, fp: f, title: a.n.title, start: a.n.start } }))
    else if (a.op === "createO") api("o365", "POST", ob, Sync.graphBody(a.n, tz), made(function(id) { return { o: id, g: a.rid, fp: f, title: a.n.title, start: a.n.start } }))
    else if (a.op === "updateG") api("google", "PATCH", gb + "/" + encodeURIComponent(a.rid), Sync.googlePatch(a.n, false, tz), function(ok, json, problem) { if (ok) sync.stats.out++; else failed(problem); next() })
    else if (a.op === "updateO") api("o365", "PATCH", graph + "/me/events/" + encodeURIComponent(a.rid), Sync.graphPatch(a.n, false, tz), function(ok, json, problem) { if (ok) sync.stats.out++; else failed(problem); next() })
    else if (a.op === "deleteG") api("google", "DELETE", gb + "/" + encodeURIComponent(a.rid), null, gone)
    else if (a.op === "deleteO") api("o365", "DELETE", graph + "/me/events/" + encodeURIComponent(a.rid), null, gone)
    else next()
  }

  function remoteOp(c, meta, a, next) {
    var o365 = c.provider === "o365"
    var coll = o365 ? graph + "/me/calendars/" + encodeURIComponent(meta.id) + "/events" : gcal + "/calendars/" + encodeURIComponent(meta.id) + "/events"
    var one = o365 ? graph + "/me/events/" + encodeURIComponent(a.rid || "") : coll + "/" + encodeURIComponent(a.rid || "")
    function failed(problem) { sync.problems = sync.problems.concat([c.name + ": “" + (a.title || "") + "”: " + problem]) }
    if (a.op === "remoteCreate") {
      api(c.provider, "POST", coll, o365 ? Sync.graphBody(a.n, tz) : Sync.googleBody(a.n, tz), function(ok, json, problem) {
        if (ok && json.id) {
          sync.links = sync.links.concat([{ nb: a.nb, cal: c.key, rid: json.id, fp: Sync.fp(a.n, null), title: a.n.title, start: a.n.start, recurring: false }])
          sync.saveLinks()
          sync.stats.out++
        } else failed(problem)
        next()
      })
    } else if (a.op === "remoteUpdate") {
      api(c.provider, "PATCH", one, o365 ? Sync.graphPatch(a.n, a.recurring, tz) : Sync.googlePatch(a.n, a.recurring, tz), function(ok, json, problem) {
        if (ok) sync.stats.out++
        else failed(problem)
        next()
      })
    } else if (a.op === "remoteDelete") {
      api(c.provider, "DELETE", one, null, function(ok, json, problem) {
        // (Already gone there: as good as deleted.)
        if (ok || /^(404|410)/.test(problem)) sync.stats.out++
        else failed(problem)
        next()
      })
    } else next()
  }

  onReadyChanged: if (ready) load()
  Component.onCompleted: if (ready) load()
}
