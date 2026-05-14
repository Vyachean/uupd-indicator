import Gtk from "gi://Gtk";
import Adw from "gi://Adw";

import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import {
  createExtensionSettings,
  getVisibilityMode,
  VISIBILITY_MODE_ALWAYS,
  VISIBILITY_MODE_AUTO,
} from "./lib/settings.js";

const VISIBILITY_OPTIONS = [
  {
    id: VISIBILITY_MODE_AUTO,
    label: _("Auto: show only while updates run or when an update fails"),
  },
  {
    id: VISIBILITY_MODE_ALWAYS,
    label: _("Always: keep the indicator visible in the top bar"),
  },
];

export default class UupdIndicatorPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = createExtensionSettings(this);
    const page = new Adw.PreferencesPage({
      title: _("General"),
      icon_name: "preferences-system-symbolic",
    });
    const group = new Adw.PreferencesGroup({
      title: _("Indicator"),
    });
    const row = new Adw.ComboRow({
      title: _("Visibility"),
      use_subtitle: true,
      model: Gtk.StringList.new(VISIBILITY_OPTIONS.map(option => option.label)),
    });

    const selectedIndex = VISIBILITY_OPTIONS.findIndex(
      option => option.id === getVisibilityMode(settings)
    );
    row.selected = selectedIndex >= 0 ? selectedIndex : 0;
    row.connect("notify::selected", comboRow => {
      const option = VISIBILITY_OPTIONS[comboRow.selected] ?? VISIBILITY_OPTIONS[0];
      settings.setVisibilityMode(option.id);
    });

    group.add(row);
    page.add(group);
    window.add(page);
    window.connect("destroy", () => settings.destroy?.());
  }
}
