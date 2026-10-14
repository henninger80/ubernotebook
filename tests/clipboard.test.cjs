// Every text field in Uber Notebook (a TextInput or TextEdit) is editable
// only while its window shows (or is never editable): an editable field reads
// the clipboard each time it changes (Qt's canPaste), and the app stays
// loaded in the Omarchy shell after its window closes, so a closed window's
// fields must not. tests/qml/tst_clipboardguard.qml shows it.
// Usage (from the plugin directory): node tests/clipboard.test.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { root } = require("./load.cjs");

const GUARD = "!(Window.window && Window.window.visible)";
let fields = 0;
const files = [...fs.readdirSync(path.join(root, "app")).map((f) => "app/" + f), ...fs.readdirSync(root)].filter((f) => f.endsWith(".qml"));
for (const f of files) {
  const lines = fs.readFileSync(path.join(root, f), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!/^\s*(TextInput|TextEdit|TextField|TextArea)\s*\{/.test(line)) return;
    fields++;
    // Its own readOnly, before the next element starts at its depth.
    const depth = line.match(/^\s*/)[0].length;
    let ro = "";
    for (let k = i + 1; k < lines.length; k++) {
      const l = lines[k];
      if (l.trim() === "}" && l.match(/^\s*/)[0].length === depth) break;
      if (l.match(/^\s*/)[0].length === depth + 2 && /^\s*readOnly:/.test(l)) { ro = l.trim(); break; }
    }
    assert.ok(ro === "readOnly: true" || ro.includes(GUARD), `${f}:${i + 1}: a text field editable while its window is closed (${ro || "no readOnly"})`);
  });
}
assert.ok(fields >= 20, "found the fields: " + fields);
console.log(`clipboard: ${fields} text fields checked`);
