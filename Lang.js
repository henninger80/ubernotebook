.pragma library
.import "Lang_de.js" as De

// [fork] The app in the system's language, German or English. Every text
// the app shows goes through t(): its German from Lang_de.js, or the
// English as it is when there's none (a page's own words never match, so
// they stay as they are). Upstream's English stays the key, so its new
// texts show in English until they're added to Lang_de.js (docs/lang.md).

var lang = typeof Qt !== "undefined" && String(Qt.locale().name).indexOf("de") === 0 ? "de" : "en"

function t(text) {
  if (lang !== "de" || typeof text !== "string" || !text) return text
  return Object.prototype.hasOwnProperty.call(De.WORDS, text) ? De.WORDS[text] : text
}
