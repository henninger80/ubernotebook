// Search.js - (fork) finding pages by their words, as Ctrl+P and `find` do, in
// the pages' text kept in memory (Workspace.qml's texts) rather than with
// grep on their files:
//
// * Accents and umlauts aside: "muller" finds "Müller", "cafe" finds
//   "Café"; and as Germans write them without, "Mueller" and "Strasse" find
//   "Müller" and "Straße".
// * A word written a little wrong: one with no page at all is looked for
//   among the words that are there, a letter or two off ("Protokol" finds
//   "Protokoll", "Vorstnad" finds "Vorstand"), scored lower.
//
// Each page's text is folded once (lowercase, accents off, a letter for a
// letter so places in it are places in the text) and kept until it changes,
// and its words counted, for the second. warm() does all that a little at a
// time once the pages are read (Workspace.qml), so no search waits for it.
// Shared with tests/search.test.cjs, so keep it plain JavaScript with no QML
// or Node APIs.
.pragma library
.import "Workspace.js" as Workspace

// id -> { src (the text it's of), fold, title (its title's length), tsrc,
// tfold (its title, folded), words ({ word: true }, or null: not counted yet) }
var cache = {}
// word -> how many pages have it (those whose words are counted).
var vocab = {}
// Every page's words counted (else ensureVocab counts the rest).
var counted = false
// The words by their first letter: { a: [...] }, made from vocab when it's wanted.
var byFirst = null

// A letter for a letter (V4 runs a few replaces over a page far quicker
// than one with a function for each letter).
function fold(s) {
  return String(s || "").toLowerCase()
    .replace(/[àáâãäåāăą]/g, "a").replace(/[çćčĉ]/g, "c").replace(/[ďđ]/g, "d")
    .replace(/[èéêëēĕėęě]/g, "e").replace(/[ğĝģ]/g, "g").replace(/[ìíîïĩīĭįı]/g, "i")
    .replace(/[ĺļľłŀ]/g, "l").replace(/[ñńņňŉ]/g, "n").replace(/[òóôõöøōŏő]/g, "o")
    .replace(/[ŕřŗ]/g, "r").replace(/[ßśŝşš]/g, "s").replace(/[ţťŧ]/g, "t")
    .replace(/[ùúûüũūŭůűų]/g, "u").replace(/[ýÿŷ]/g, "y").replace(/[źżž]/g, "z")
    .replace(/æ/g, "a").replace(/œ/g, "o")
}

// What a word of the query is looked for as: folded, and as written without
// umlauts ("mueller" -> "muller", "strasse" -> "strase", as ß folds).
function variants(term) {
  var a = fold(term)
  var b = a.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u").replace(/ss/g, "s")
  return b !== a ? [a, b] : [a]
}

var SPLIT = /[^0-9a-zĀ-￿]+/
function wordsOf(f) {
  var out = {}
  var list = f.split(SPLIT)
  for (var i = 0; i < list.length; i++) if (list[i].length >= 3) out[list[i]] = true
  return out
}

function count(e) {
  if (e.words) return
  e.words = wordsOf(e.fold)
  for (var w in e.words) vocab[w] = (vocab[w] || 0) + 1
  byFirst = null
}
function uncount(e) {
  if (!e || !e.words) return
  for (var w in e.words) { if (--vocab[w] <= 0) delete vocab[w] }
  e.words = null
  byFirst = null
}

// The page's folded text, made now if it's new or changed (and its words
// counted, once every page's are).
function entry(id, text, title) {
  var e = cache[id]
  var t = String(title || "Untitled")
  if (e && e.src === text) {
    if (e.tsrc !== t) { e.tsrc = t; e.tfold = fold(t) }
    return e
  }
  uncount(e)
  e = { src: text, fold: fold(text), title: String(title || "").length, tsrc: t, tfold: fold(t), words: null }
  cache[id] = e
  if (counted) count(e)
  return e
}

// Every page's words counted.
function ensureVocab() {
  if (counted) return
  for (var id in cache) count(cache[id])
  counted = true
}

// A little of what a search needs done ahead (every page folded, its words
// counted), for about `ms`: whether it's all done.
function warm(index, texts, ms) {
  var start = Date.now()
  for (var id in index.pages) {
    if (texts[id] === undefined) continue
    var e = cache[id]
    if (e && e.src === texts[id] && e.words) continue
    count(entry(id, texts[id], index.pages[id].title))
    if (Date.now() - start >= ms) return false
  }
  counted = true
  return true
}

// Two words at most `k` letters apart (a letter changed, added, taken out,
// or two swapped), or not.
function near(a, b, k) {
  var n = a.length, m = b.length
  if (Math.abs(n - m) > k) return false
  var prev2 = null, prev = [], cur
  for (var j = 0; j <= m; j++) prev.push(j)
  for (var i = 1; i <= n; i++) {
    cur = [i]
    var low = i
    for (j = 1; j <= m; j++) {
      var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1
      var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (prev2 && i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) v = Math.min(v, prev2[j - 2] + 1)
      cur.push(v)
      if (v < low) low = v
    }
    if (low > k) return false
    prev2 = prev
    prev = cur
  }
  return prev[m] <= k
}

// The words on pages a letter or two off a word of the query (none of
// four letters or fewer): [word].
function nearWords(term) {
  if (term.length < 4) return []
  ensureVocab()
  if (!byFirst) {
    byFirst = {}
    for (var w in vocab) { var c = w.charAt(0); (byFirst[c] = byFirst[c] || []).push(w) }
  }
  var k = term.length >= 8 ? 2 : 1
  // (Starting with its first letter, or its second: the first one left
  // out or swapped.)
  var pool = (byFirst[term.charAt(0)] || []).concat(term.charAt(1) !== term.charAt(0) ? byFirst[term.charAt(1)] || [] : [])
  return pool.filter(function(w) { return w !== term && near(term, w, k) })
}

// Whether every page's text is there to look in (else grep, as before).
function complete(index, texts) {
  for (var id in index.pages) if (texts[id] === undefined && !index.pages[id].trashed) return false
  return true
}

// Pages with every word of the query, best first: [{ id, score, at, length }],
// `at` and `length` where the first word is in its text (after its title;
// -1 if only in the title). A word in the title counts 3, in the text 1, a
// letter off half that.
function find(index, texts, query, limit) {
  var terms = Workspace.terms(query)
  if (!terms.length) return []
  var vars = terms.map(variants)
  var ids = []
  for (var id in index.pages) {
    if (Workspace.inTrash(index, id) || Workspace.inTemplates(index, id)) continue
    ids.push(id)
  }
  // (Pages gone: off the cache.)
  for (var c in cache) if (!index.pages[c]) delete cache[c]
  var hits = terms.map(function() { return 0 })
  var rows = ids.map(function(pid) {
    var e = index.pages[pid]
    var en = entry(pid, texts[pid] !== undefined ? texts[pid] : (e.title || ""), e.title || "")
    var title = en.tfold
    return { id: pid, e: en, title: title, found: vars.map(function(vs, i) {
      var t = -1, b = -1, len = 0
      for (var j = 0; j < vs.length; j++) {
        if (t < 0 && title.indexOf(vs[j]) >= 0) t = 1
        if (b < 0) { b = en.fold.indexOf(vs[j], en.title); len = vs[j].length }
      }
      if (t > 0 || b >= 0) hits[i]++
      return { title: t > 0, at: b, length: b >= 0 ? len : 0, near: false }
    }) }
  })
  // A word no page has: the words a letter or two off it.
  var alt = terms.map(function(t, i) { return hits[i] ? [] : nearWords(vars[i][vars[i].length - 1]) })
  var out = []
  rows.forEach(function(r) {
    var score = 0
    var first = -1, firstLen = 0
    for (var i = 0; i < terms.length; i++) {
      var f = r.found[i]
      if (!f.title && f.at < 0 && alt[i].length) {
        count(r.e)
        for (var a = 0; a < alt[i].length; a++) {
          var w = alt[i][a]
          if (r.title.indexOf(w) >= 0) { f.title = true; f.near = true; break }
          if (r.e.words[w]) { var at = r.e.fold.indexOf(w, r.e.title); if (at >= 0) { f.at = at; f.length = w.length; f.near = true; break } }
        }
      }
      if (!f.title && f.at < 0) { score = 0; break }
      score += ((f.title ? 3 : 0) + (f.at >= 0 ? 1 : 0)) * (f.near ? 0.5 : 1)
      if (f.at >= 0 && (first < 0 || f.at < first)) { first = f.at; firstLen = f.length }
    }
    if (score > 0) out.push({ id: r.id, score: score, at: first, length: firstLen })
  })
  out.sort(function(a, b) { return b.score - a.score || ((index.pages[a.id].modified || "") < (index.pages[b.id].modified || "") ? 1 : -1) })
  return out.slice(0, limit || 50)
}

// The words around a place in a page's text (after its title): { before,
// match, after }, as Workspace.snippet gives them.
function snippet(text, title, at, length, radius) {
  var s = String(text || "")
  var r = radius || 40
  var body0 = String(title || "").length
  if (at < 0) {
    var body = s.slice(body0).replace(/\s+/g, " ").trim()
    return { before: body.slice(0, r * 2), match: "", after: "" }
  }
  var start = Math.max(body0, at - r)
  var end = Math.min(s.length, at + length + r)
  function flat(x) { return x.replace(/\s+/g, " ") }
  return {
    before: (start > body0 ? "…" : "") + flat(s.slice(start, at)).replace(/^\s+/, ""),
    match: flat(s.slice(at, at + length)),
    after: flat(s.slice(at + length, end)).replace(/\s+$/, "") + (end < s.length ? "…" : "")
  }
}
