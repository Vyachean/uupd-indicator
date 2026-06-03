import Gtk from "gi://Gtk";
import Adw from "gi://Adw";

import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import {
  createExtensionSettings,
  getShowRebootRequired,
  getVisibilityMode,
  SHOW_REBOOT_REQUIRED_KEY,
  VISIBILITY_MODE_ALWAYS,
  VISIBILITY_MODE_AUTO,
} from "./lib/settings.js";

export default class UupdIndicatorPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = createExtensionSettings(this);
    const visibilityOptions = [
      {
        id: VISIBILITY_MODE_AUTO,
        label: _("Auto"),
        subtitle: _("Show only while updates run or when an update fails"),
      },
      {
        id: VISIBILITY_MODE_ALWAYS,
        label: _("Always"),
        subtitle: _("Keep the indicator visible in the top bar"),
      },
    ];
    const page = new Adw.PreferencesPage({
      title: _("General"),
      icon_name: "preferences-system-symbolic",
    });
    const group = new Adw.PreferencesGroup({
      title: _("Indicator"),
    });
    const row = new Adw.ComboRow({
      title: _("Visibility"),
      model: Gtk.StringList.new(visibilityOptions.map(option => option.label)),
    });

    const syncVisibilityRow = comboRow => {
      const option = visibilityOptions[comboRow.selected] ?? visibilityOptions[0];

      comboRow.subtitle = option.subtitle;
      settings.setVisibilityMode(option.id);
    };

    const selectedIndex = visibilityOptions.findIndex(
      option => option.id === getVisibilityMode(settings)
    );
    row.selected = selectedIndex >= 0 ? selectedIndex : 0;
    syncVisibilityRow(row);
    row.connect("notify::selected", syncVisibilityRow);

    const rebootRow = new Adw.SwitchRow({
      title: _("Show restart-required status"),
      subtitle: _("Keep the indicator visible when a system update is staged and a restart is required."),
      active: getShowRebootRequired(settings),
    });
    let syncingRebootRow = false;

    rebootRow.connect("notify::active", switchRow => {
      if (syncingRebootRow)
        return;

      settings.setShowRebootRequired(switchRow.active);
    });

    settings.connect(`changed::${SHOW_REBOOT_REQUIRED_KEY}`, () => {
      const nextValue = getShowRebootRequired(settings);

      if (rebootRow.active === nextValue)
        return;

      syncingRebootRow = true;
      rebootRow.active = nextValue;
      syncingRebootRow = false;
    });

    group.add(row);
    group.add(rebootRow);
    page.add(group);
    window.add(page);
    window.connect("destroy", () => settings.destroy?.());
  }
}
