import St from "gi://St";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";

import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import {
  formatElapsedDuration,
  formatTimestamp,
} from "./formatting.js";
import {
  getShowRebootRequired,
  getVisibilityMode,
} from "./settings.js";
import {
  createInitialState,
  deriveIndicatorState,
  formatServiceStateLabel,
} from "./state.js";
import {
  FakeUupdStateProvider,
  SystemdUupdStateProvider,
} from "./systemdProvider.js";

function createValueRow() {
  const item = new PopupMenu.PopupBaseMenuItem({
    reactive: false,
    can_focus: false,
  });
  const box = new St.BoxLayout({
    vertical: false,
    x_expand: true,
    y_align: Clutter.ActorAlign.CENTER,
  });
  const label = new St.Label({
    x_expand: true,
    style_class: "popup-menu-item",
  });
  const value = new St.Label({
    style_class: "popup-menu-item",
    x_align: Clutter.ActorAlign.END,
  });

  label.clutter_text.set_x_expand(true);
  value.clutter_text.set_x_align(Clutter.ActorAlign.END);

  box.add_child(label);
  box.add_child(value);
  item.add_child(box);

  return { item, label, value };
}

function createTextRow() {
  const item = new PopupMenu.PopupBaseMenuItem({
    reactive: false,
    can_focus: false,
  });
  const label = new St.Label({
    style_class: "popup-menu-item",
    x_expand: true,
  });

  item.add_child(label);

  return { item, label };
}

export const UupdIndicator = GObject.registerClass(
  {
    GTypeName: "UupdIndicator",
  },
  class UupdIndicator extends PanelMenu.Button {
    _init({ provider = new SystemdUupdStateProvider(), settings = null } = {}) {
      super._init(0.0, _("Universal Blue Update Indicator"));
      this._destroyed = false;
      this._provider = null;
      this._providerChangedId = null;
      this._settings = settings;
      this._settingsChangedId = 0;
      this._settingsShowRebootRequiredChangedId = 0;
      this._testProvider = null;
      this._pulseDirection = -1;
      this._pulseOpacity = 255;
      this._iconAnimation = null;
      this._dismissedFailedState = false;
      this._lastObservedServiceState = null;

      this._icon = new St.Icon({
        icon_name: "folder-download-symbolic",
        style_class: "system-status-icon",
      });
      this.add_child(this._icon);

      this._titleItem = new PopupMenu.PopupMenuItem("", {
        reactive: false,
        can_focus: false,
      });
      this._titleItem.setSensitive(false);
      this.menu.addMenuItem(this._titleItem);

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      this._rows = {
        state: createValueRow(),
        status: createValueRow(),
        elapsed: createValueRow(),
        automaticUpdates: createValueRow(),
        nextCheck: createValueRow(),
        lastTrigger: createValueRow(),
        serviceResult: createValueRow(),
        exitStatus: createValueRow(),
        lastRun: createValueRow(),
        source: createValueRow(),
        lastChecked: createValueRow(),
      };

      for (const row of Object.values(this._rows)) {
        row.item.setSensitive(false);
        this.menu.addMenuItem(row.item);
      }

      this._hintRow = createTextRow();
      this._hintRow.item.setSensitive(false);
      this.menu.addMenuItem(this._hintRow.item);

      this._dismissItem = new PopupMenu.PopupMenuItem(_("Dismiss"));
      this._dismissItem.connect("activate", () => {
        this._dismissedFailedState = true;
        this._updateIndicatorState();
      });
      this.menu.addMenuItem(this._dismissItem);

      this.hide();
      this._connectSettings();
      this._setProvider(provider);
    }

    _connectSettings() {
      if (!this._settings?.connect)
        return;

      this._settingsChangedId = this._settings.connect(
        "changed::visibility-mode",
        () => this._updateIndicatorState()
      );
      this._settingsShowRebootRequiredChangedId = this._settings.connect(
        "changed::show-reboot-required",
        () => this._updateIndicatorState()
      );
    }

    _setProvider(provider) {
      if (this._providerChangedId && this._provider) {
        this._provider.disconnect(this._providerChangedId);
        this._providerChangedId = null;
      }

      this._provider?.destroy();
      this._provider = provider;
      this._providerChangedId = this._provider.connect(
        "state-changed",
        () => this._updateIndicatorState()
      );
      this._provider.start();
      this._updateIndicatorState();
    }

    setStateForTesting(nextState) {
      if (!this._testProvider) {
        this._testProvider = new FakeUupdStateProvider();
        this._setProvider(this._testProvider);
      }

      this._testProvider.setState(nextState);
    }

    setVisibilityModeForTesting(mode) {
      this._settings?.setVisibilityMode?.(mode);
      this._updateIndicatorState();
    }

    setShowRebootRequiredForTesting(enabled) {
      this._settings?.setShowRebootRequired?.(enabled);
      this._updateIndicatorState();
    }

    clearTestState() {
      if (!this._testProvider)
        return;

      this._testProvider = null;
      this._setProvider(new SystemdUupdStateProvider());
    }

    _startIconAnimation() {
      if (this._destroyed || this._iconAnimation)
        return;

      this._iconAnimation = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
        if (this._destroyed)
          return GLib.SOURCE_REMOVE;

        this._pulseOpacity += this._pulseDirection * 8;

        if (this._pulseOpacity <= 100) {
          this._pulseDirection = 1;
          this._pulseOpacity = 100;
        } else if (this._pulseOpacity >= 255) {
          this._pulseDirection = -1;
          this._pulseOpacity = 255;
        }

        this._icon.ease({
          opacity: this._pulseOpacity,
          duration: 80,
          mode: Clutter.AnimationMode.LINEAR,
        });

        return GLib.SOURCE_CONTINUE;
      });
    }

    _stopIconAnimation() {
      if (this._iconAnimation) {
        GLib.source_remove(this._iconAnimation);
        this._iconAnimation = null;
      }

      if (!this._destroyed)
        this._icon.opacity = 255;
    }

    _setRowVisible(row, label, value) {
      const visible = value !== null && value !== undefined && value !== "";
      row.label.text = label;
      row.value.text = visible ? String(value) : "";
      row.item.visible = visible;
    }

    _hideAllPopupRows() {
      for (const row of Object.values(this._rows))
        row.item.visible = false;

      this._hintRow.item.visible = false;
      this._hintRow.label.text = "";
      this._dismissItem.visible = false;
    }

    _updateIdlePopup(state, derivedState) {
      const { status, automaticUpdates, nextCheck } = this._rows;

      this._titleItem.label.text = _("Universal Blue Update Indicator");
      this._setRowVisible(status, _("Status"), _("Idle"));
      this._setRowVisible(
        automaticUpdates,
        _("Automatic updates"),
        derivedState.timerEnabled ? _("Enabled") : _("Disabled")
      );
      this._setRowVisible(
        nextCheck,
        _("Next check"),
        formatTimestamp(state.timerNextElapseUSecRealtime)
      );
    }

    _updateRebootRequiredPopup(state) {
      const { status, source, lastChecked } = this._rows;

      this._titleItem.label.text = _("Restart required");
      this._setRowVisible(status, _("Status"), _("Restart required to apply system update"));
      this._setRowVisible(source, _("Source"), state.deploymentStatusSource);
      this._setRowVisible(
        lastChecked,
        _("Last checked"),
        formatTimestamp(state.deploymentStatusCheckedAt
          ? state.deploymentStatusCheckedAt * 1000
          : null)
      );
    }

    _updateUpdatingPopup(state, derivedState) {
      const { status, elapsed, automaticUpdates } = this._rows;

      this._titleItem.label.text = _("System update in progress");
      this._setRowVisible(
        status,
        _("Status"),
        _("Updating")
      );
      this._setRowVisible(
        elapsed,
        _("Elapsed"),
        formatElapsedDuration(state.serviceActiveEnterTimestamp)
      );
      this._setRowVisible(
        automaticUpdates,
        _("Automatic updates"),
        derivedState.timerEnabled ? _("Enabled") : _("Disabled")
      );
    }

    _updateFailedPopup(state) {
      const { state: serviceState, serviceResult, exitStatus, lastRun } = this._rows;

      this._titleItem.label.text = _("Automatic update failed");
      this._setRowVisible(
        serviceState,
        _("State"),
        formatServiceStateLabel(state.serviceActiveState, state.serviceSubState)
      );
      this._setRowVisible(serviceResult, _("Service result"), state.serviceResult);
      this._setRowVisible(
        exitStatus,
        _("Exit status"),
        state.serviceExecMainStatus !== null ? state.serviceExecMainStatus : null
      );
      this._setRowVisible(
        lastRun,
        _("Last run"),
        formatTimestamp(state.serviceInactiveEnterTimestamp)
      );

      this._hintRow.item.visible = true;
      this._hintRow.label.text = _("Run `just logs` in the repository or check `journalctl -u uupd.service` for details.");
      this._dismissItem.visible = true;
    }

    _updatePopup(state, derivedState) {
      this._hideAllPopupRows();

      if (derivedState.mode === "failed") {
        this._updateFailedPopup(state);
        return;
      }

      if (derivedState.mode === "updating") {
        this._updateUpdatingPopup(state, derivedState);
        return;
      }

      if (derivedState.mode === "reboot-required") {
        this._updateRebootRequiredPopup(state);
        return;
      }

      this._updateIdlePopup(state, derivedState);
    }

    _updateSessionSignals(state) {
      const currentState = state.serviceActiveState ?? state.serviceState ?? null;
      const previousState = this._lastObservedServiceState;

      if (previousState !== null && previousState !== currentState)
        this._dismissedFailedState = false;

      this._lastObservedServiceState = currentState;
    }

    _updateIndicatorState() {
      if (this._destroyed)
        return;

      const state = this._provider?.getState() ?? createInitialState();
      this._updateSessionSignals(state);

      const derivedState = deriveIndicatorState(state, {
        failureDismissed: this._dismissedFailedState,
        showRebootRequired: getShowRebootRequired(this._settings),
        visibilityMode: getVisibilityMode(this._settings),
      });

      this._icon.icon_name = derivedState.iconName;
      this._updatePopup(state, derivedState);

      if (!derivedState.visible) {
        this._stopIconAnimation();
        this.hide();
        return;
      }

      this.show();

      if (derivedState.pulsing)
        this._startIconAnimation();
      else
        this._stopIconAnimation();
    }

    destroy() {
      this._destroyed = true;
      this._stopIconAnimation();

      if (this._providerChangedId && this._provider) {
        this._provider.disconnect(this._providerChangedId);
        this._providerChangedId = null;
      }

      if (this._settingsChangedId && this._settings?.disconnect) {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = 0;
      }

      if (this._settingsShowRebootRequiredChangedId && this._settings?.disconnect) {
        this._settings.disconnect(this._settingsShowRebootRequiredChangedId);
        this._settingsShowRebootRequiredChangedId = 0;
      }

      this._provider?.destroy();
      this._provider = null;
      this._testProvider = null;
      this._settings = null;
      super.destroy();
    }
  }
);
