import QtQuick

// (fork) The pane beside the first in Pages (Tabs.js, docs/tabs.md): a
// second DocView, without its sidebar, with tabs of its own. Opened with
// Ctrl+Shift+S, the button in the bar, a page's "Open beside" or a
// Ctrl+Shift+click on a link; the line between the two dragged to make one
// wider. Its tabs are kept (splitTabs) while it's open, and go with it.
//
// What it asks for (a toast, a confirmation, an import) is asked as the
// first pane would (its signals), so App.qml handles it as it does those.
Item {
  id: split

  property var theme: null
  property var workspace: null
  property var service: null
  // The first pane (App's DocView).
  property var first: null
  readonly property var settings: service && service.settings ? service.settings : ({})
  readonly property bool shown: settings.split === true
  readonly property alias pane: loader.item
  // The first pane's share, in percent, while the line's dragged.
  property real dragged: -1
  readonly property real share: dragged >= 0 ? dragged : (settings.splitWidth || 50)
  // (Opened on a page: not on its tabs from before, nor the page you were on.)
  property bool opening: false

  width: shown && parent ? Math.round(parent.width * (100 - share) / 100) : 0
  visible: shown

  // A page beside the first: the pane opened on it, else it in a new tab there.
  function openBeside(id) {
    if (!shown) {
      opening = true
      // (Made at once: the setting's change makes it, Loader's not asynchronous.)
      if (service) service.setSettings({ split: true, splitTabs: [], splitTabAt: 0 })
      opening = false
      if (!loader.item) return
      loader.item.tabsRestored = true
      if (id) loader.item.open(id)
      else loader.item.activate()
    } else if (loader.item && id) {
      if (loader.item.shownId() === "") loader.item.open(id)
      else loader.item.newTab(id)
    }
    if (loader.item) loader.item.forceActiveFocus()
  }
  // Closed: what's changed there written, its tabs not kept.
  function close() {
    if (!shown) return
    if (loader.item) loader.item.commit()
    var wasIn = loader.item && loader.item.activeFocus
    if (service) service.setSettings({ split: false, splitTabs: [], splitTabAt: 0 })
    if (first) {
      first.updateMirror()
      if (wasIn) first.activate()
    }
  }

  Loader {
    id: loader
    anchors.fill: parent
    anchors.leftMargin: 1
    active: split.shown
    asynchronous: false
    sourceComponent: DocView {
      paneName: "split"
      theme: split.theme
      workspace: split.workspace
      service: split.service
      sidebarShown: false
      // (The start page is the first pane's.)
      startShown: true
      enabled: split.visible
      onNotebooksRequested: split.first.notebooksRequested()
      onSettingsRequested: split.first.settingsRequested()
      onHelpRequested: split.first.helpRequested()
      onAboutRequested: split.first.aboutRequested()
      onSidebarChoicesRequested: split.first.sidebarChoicesRequested()
      onReleaseNotesRequested: split.first.releaseNotesRequested()
      onWhatsNewRequested: split.first.whatsNewRequested()
      onToast: function(text) { split.first.toast(text) }
      onToastUndo: function(text, undo) { split.first.toastUndo(text, undo) }
      onToastAction: function(text, label, action) { split.first.toastAction(text, label, action) }
      onPictureRequested: function(done) { split.first.pictureRequested(done) }
      onConfirmRequested: function(title, text, action, confirmed) { split.first.confirmRequested(title, text, action, confirmed) }
      onImportRequested: function(folder) { split.first.importRequested(folder) }
      onSplitClosed: split.close()
    }
    onLoaded: {
      item.peer = split.first
      if (split.first) split.first.peer = item
      // (Open since last time: its tabs again.)
      if (split.opening) return
      if (split.workspace && split.workspace.ready) item.activate()
      else item.pendingActivate = true
    }
    onItemChanged: if (!item && split.first) { split.first.peer = null; split.first.updateMirror() }
  }

  // The line between the panes: dragged, the first one wider or narrower.
  Rectangle {
    width: 1
    height: parent.height
    color: split.theme ? split.theme.line : "#444"
  }
  Item {
    x: -4
    width: 9
    height: parent.height
    z: 10
    HoverHandler { cursorShape: Qt.SplitHCursor }
    DragHandler {
      id: lineDrag
      target: null
      yAxis.enabled: false
      property real startShare: 50
      onActiveChanged: {
        if (active) { startShare = split.share; return }
        var keep = Math.round(split.dragged)
        split.dragged = -1
        if (split.service && keep >= 0) split.service.setSetting("splitWidth", keep)
      }
      onTranslationChanged: {
        if (!active || !split.parent || split.parent.width <= 0) return
        split.dragged = Math.max(25, Math.min(75, startShare + translation.x / split.parent.width * 100))
      }
    }
    TapHandler { onDoubleTapped: if (split.service) split.service.setSetting("splitWidth", 50) }
  }
}
