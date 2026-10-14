import QtQuick
import QtTest
import "../../app"

// A text field is editable only while its window shows: closed, it's read
// only, so Qt never reads the clipboard for it (tests/clipboard.test.cjs
// checks every field has this). Shown again, it takes typing as before.
Item {
  id: root
  width: 400
  height: 200

  Theme { id: th }
  Window {
    id: win
    width: 300
    height: 100
    visible: true
    Field { id: field; theme: th; x: 10; y: 10 }
  }

  TestCase {
    name: "ClipboardGuard"
    when: windowShown

    function test_editable_only_while_shown() {
      tryVerify(function() { return win.visible }, 2000)
      verify(!field.input.readOnly, "shown: editable")
      field.text = "keep"
      win.visible = false
      tryVerify(function() { return field.input.readOnly }, 1000, "closed: read only")
      verify(!field.input.canPaste, "and it doesn't ask the clipboard")
      compare(field.text, "keep", "what's in it stays")
      win.visible = true
      tryVerify(function() { return !field.input.readOnly }, 1000, "shown again: editable")
      win.requestActivate()
      field.focusField()
      tryVerify(function() { return field.input.activeFocus }, 1000)
      keyClick(Qt.Key_A)
      compare(field.text, "a", "it takes typing (focusField picks all)")
    }
  }
}
