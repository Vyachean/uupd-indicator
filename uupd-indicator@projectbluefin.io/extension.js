/*
 * License: GPLv3
 * Authors:
 *  Universal Blue Contributors
 * Based on: VanillaOS Update Check Extension
 * Copyright: 2025
 */

import St from "gi://St";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

const DBUS_NAME = "org.freedesktop.systemd1";
const DBUS_SERVICE_PATH = "/org/freedesktop/systemd1/unit/uupd_2eservice";
const DBUS_TIMER_PATH = "/org/freedesktop/systemd1/unit/uupd_2etimer";
const DBUS_CONNECTION = Gio.DBus.system;
const DEBUG = false;
const COMPLETED_VISIBILITY_MS = 5000;

function debug(message) {
  if (DEBUG)
    console.debug(`[uupd-indicator] ${message}`);
}

function unpackMaybeVariant(value) {
  return value && typeof value.deep_unpack === "function"
    ? value.deep_unpack()
    : value;
}

function normalizeOptionalString(value) {
  const unpacked = unpackMaybeVariant(value);
  return typeof unpacked === "string" && unpacked.length > 0 ? unpacked : null;
}

function normalizeOptionalNumber(value) {
  const unpacked = unpackMaybeVariant(value);
  if (typeof unpacked === "number")
    return unpacked;

  if (typeof unpacked === "bigint")
    return Number(unpacked);

  return null;
}

function isTimerEnabled(state) {
  return state.timerUnitFileState === "enabled"
    || state.timerUnitFileState === "enabled-runtime"
    || state.timerUnitFileState === "static"
    || state.timerEnabled === true;
}

function isServiceUpdating(serviceActiveState) {
  return serviceActiveState === "active" || serviceActiveState === "activating";
}

function isServiceFailed(serviceActiveState) {
  return serviceActiveState === "failed";
}

function formatTimestamp(usec) {
  if (!usec || usec <= 0)
    return null;

  try {
    return GLib.DateTime.new_from_unix_local(Math.floor(usec / 1000000))
      ?.format("%Y-%m-%d %H:%M:%S") ?? null;
  } catch (_error) {
    return null;
  }
}

function formatElapsedDuration(usec) {
  if (!usec || usec <= 0)
    return null;

  const nowUsec = GLib.DateTime.new_now_local().to_unix() * 1000000;
  const elapsedSeconds = Math.max(0, Math.floor((nowUsec - usec) / 1000000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0)
    return `${hours}h ${minutes}m`;

  if (minutes > 0)
    return `${minutes}m ${seconds}s`;

  return `${seconds}s`;
}

function formatServiceStateLabel(activeState, subState) {
  if (!activeState)
    return _("Unknown");

  const labels = {
    active: _("Active"),
    activating: _("Activating"),
    inactive: _("Inactive"),
    failed: _("Failed"),
    deactivating: _("Stopping"),
    maintenance: _("Maintenance"),
    reloading: _("Reloading"),
  };
  const label = labels[activeState] ?? activeState;

  return subState ? `${label} (${subState})` : label;
}

function getServiceStateIconName(derivedState) {
  switch (derivedState) {
  case "failed":
    return "dialog-warning-symbolic";
  case "completed":
    return "emblem-ok-symbolic";
  case "updating":
    return "folder-download-symbolic";
  default:
    return "folder-download-symbolic";
  }
}

function shouldPulseIcon(derivedState) {
  return derivedState === "updating";
}

function deriveIndicatorState(state, options = {}) {
  const timerEnabled = isTimerEnabled(state);
  const serviceActiveState = state.serviceActiveState ?? state.serviceState ?? null;
  const serviceFailed = isServiceFailed(serviceActiveState);
  const serviceUpdating = isServiceUpdating(serviceActiveState);
  const hasObservedCompletion = Boolean(options.hasObservedCompletion);
  const failureDismissed = Boolean(options.failureDismissed);

  let mode = "hidden";

  if (serviceUpdating && timerEnabled)
    mode = "updating";
  else if (serviceFailed && !failureDismissed)
    mode = "failed";
  else if (hasObservedCompletion)
    mode = "completed";

  return {
    mode,
    visible: mode !== "hidden",
    pulsing: shouldPulseIcon(mode),
    timerEnabled,
    serviceActiveState,
    serviceFailed,
    serviceUpdating,
    iconName: getServiceStateIconName(mode),
  };
}

function createInitialState() {
  return {
    timerEnabled: false,
    timerLoadState: null,
    timerUnitFileState: null,
    timerActiveState: null,
    timerSubState: null,
    timerNextElapseUSecRealtime: null,
    timerLastTriggerUSec: null,
    serviceState: null,
    serviceLoadState: null,
    serviceActiveState: null,
    serviceSubState: null,
    serviceResult: null,
    serviceExecMainStatus: null,
    serviceActiveEnterTimestamp: null,
    serviceInactiveEnterTimestamp: null,
  };
}

const StateProvider = GObject.registerClass(
  {
    Signals: {
      "state-changed": {},
    },
  },
  class StateProvider extends GObject.Object {
    _init() {
      super._init();
      this._state = createInitialState();
    }

    start() {
    }

    destroy() {
    }

    getState() {
      return { ...this._state };
    }

    _setState(nextState) {
      const normalizedState = {
        ...createInitialState(),
        ...nextState,
      };
      normalizedState.timerEnabled = isTimerEnabled(normalizedState);
      normalizedState.serviceState = normalizedState.serviceActiveState ?? normalizedState.serviceState ?? null;

      if (JSON.stringify(this._state) === JSON.stringify(normalizedState))
        return;

      this._state = normalizedState;
      this.emit("state-changed");
    }
  }
);

const SystemdUupdStateProvider = GObject.registerClass(
  class SystemdUupdStateProvider extends StateProvider {
    _init() {
      super._init();
      this._destroyed = false;
      this._initCancellable = new Gio.Cancellable();
      this._timerUnitProxy = null;
      this._timerTypeProxy = null;
      this._serviceUnitProxy = null;
      this._serviceTypeProxy = null;
      this._proxySignalIds = [];
    }

    start() {
      this._initProxy("timerUnit", DBUS_TIMER_PATH, "org.freedesktop.systemd1.Unit");
      this._initProxy("timerType", DBUS_TIMER_PATH, "org.freedesktop.systemd1.Timer");
      this._initProxy("serviceUnit", DBUS_SERVICE_PATH, "org.freedesktop.systemd1.Unit");
      this._initProxy("serviceType", DBUS_SERVICE_PATH, "org.freedesktop.systemd1.Service");
    }

    destroy() {
      this._destroyed = true;
      this._initCancellable?.cancel();

      for (const { proxy, id } of this._proxySignalIds) {
        if (proxy && id)
          proxy.disconnect(id);
      }

      this._proxySignalIds = [];
      this._initCancellable = null;
      this._timerUnitProxy = null;
      this._timerTypeProxy = null;
      this._serviceUnitProxy = null;
      this._serviceTypeProxy = null;
    }

    _initProxy(kind, objectPath, interfaceName) {
      const proxy = new Gio.DBusProxy({
        g_connection: DBUS_CONNECTION,
        g_name: DBUS_NAME,
        g_object_path: objectPath,
        g_interface_name: interfaceName,
      });

      this[`_${kind}Proxy`] = proxy;
      proxy.init_async(
        GLib.PRIORITY_DEFAULT,
        this._initCancellable,
        (initializedProxy, result) => {
          if (this._destroyed)
            return;

          try {
            initializedProxy.init_finish(result);
            const id = initializedProxy.connect(
              "g-properties-changed",
              () => this._refreshState()
            );
            this._proxySignalIds.push({ proxy: initializedProxy, id });
            this._refreshState();
          } catch (error) {
            if (this._isCancelledError(error))
              return;

            console.warn(`[uupd-indicator] Failed to initialize ${kind} proxy: ${error.message}`);
            this[`_${kind}Proxy`] = null;
            this._refreshState();
          }
        }
      );
    }

    _isCancelledError(error) {
      return typeof error.matches === "function"
        && error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED);
    }

    _getStringProperty(proxy, propertyName) {
      if (!proxy)
        return null;

      return normalizeOptionalString(proxy.get_cached_property(propertyName));
    }

    _getNumberProperty(proxy, propertyName) {
      if (!proxy)
        return null;

      return normalizeOptionalNumber(proxy.get_cached_property(propertyName));
    }

    _refreshState() {
      if (this._destroyed)
        return;

      const nextState = {
        timerLoadState: this._getStringProperty(this._timerUnitProxy, "LoadState"),
        timerUnitFileState: this._getStringProperty(this._timerUnitProxy, "UnitFileState"),
        timerActiveState: this._getStringProperty(this._timerUnitProxy, "ActiveState"),
        timerSubState: this._getStringProperty(this._timerUnitProxy, "SubState"),
        timerNextElapseUSecRealtime: this._getNumberProperty(this._timerTypeProxy, "NextElapseUSecRealtime"),
        timerLastTriggerUSec: this._getNumberProperty(this._timerTypeProxy, "LastTriggerUSec"),
        serviceLoadState: this._getStringProperty(this._serviceUnitProxy, "LoadState"),
        serviceActiveState: this._getStringProperty(this._serviceUnitProxy, "ActiveState"),
        serviceSubState: this._getStringProperty(this._serviceUnitProxy, "SubState"),
        serviceResult: this._getStringProperty(this._serviceTypeProxy, "Result"),
        serviceExecMainStatus: this._getNumberProperty(this._serviceTypeProxy, "ExecMainStatus"),
        serviceActiveEnterTimestamp: this._getNumberProperty(this._serviceUnitProxy, "ActiveEnterTimestamp"),
        serviceInactiveEnterTimestamp: this._getNumberProperty(this._serviceUnitProxy, "InactiveEnterTimestamp"),
      };

      nextState.timerEnabled = isTimerEnabled(nextState);
      nextState.serviceState = nextState.serviceActiveState;

      debug(`Provider refresh: ${JSON.stringify(nextState)}`);
      this._setState({
        ...this.getState(),
        ...nextState,
      });
    }
  }
);

const FakeUupdStateProvider = GObject.registerClass(
  class FakeUupdStateProvider extends StateProvider {
    setState(nextState) {
      this._setState({
        ...this.getState(),
        ...nextState,
      });
    }
  }
);

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

const UupdIndicator = GObject.registerClass(
  {
    GTypeName: "UupdIndicator",
  },
  class UupdIndicator extends PanelMenu.Button {
    _init(provider = new SystemdUupdStateProvider()) {
      super._init(0.0, _("Universal Blue Update Indicator"));
      this._destroyed = false;
      this._provider = null;
      this._providerChangedId = null;
      this._testProvider = null;
      this._pulseDirection = -1;
      this._pulseOpacity = 255;
      this._iconAnimation = null;
      this._dismissedFailedState = false;
      this._lastObservedServiceState = null;
      this._completedVisibilitySource = null;
      this._showCompletedState = false;

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
        currentState: createValueRow(),
        elapsed: createValueRow(),
        automaticUpdates: createValueRow(),
        nextCheck: createValueRow(),
        lastTrigger: createValueRow(),
        serviceResult: createValueRow(),
        exitStatus: createValueRow(),
        lastRun: createValueRow(),
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
      this._setProvider(provider);
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

    _stopCompletedVisibilityTimer() {
      if (!this._completedVisibilitySource)
        return;

      GLib.source_remove(this._completedVisibilitySource);
      this._completedVisibilitySource = null;
    }

    _startCompletedVisibilityTimer() {
      this._stopCompletedVisibilityTimer();
      this._completedVisibilitySource = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        COMPLETED_VISIBILITY_MS,
        () => {
          this._completedVisibilitySource = null;
          this._showCompletedState = false;
          this._updateIndicatorState();
          return GLib.SOURCE_REMOVE;
        }
      );
    }

    _setRowVisible(row, label, value) {
      const visible = value !== null && value !== undefined && value !== "";
      row.label.text = label;
      row.value.text = visible ? String(value) : "";
      row.item.visible = visible;
    }

    _updatePopup(state, derivedState) {
      const {
        currentState,
        elapsed,
        automaticUpdates,
        nextCheck,
        lastTrigger,
        serviceResult,
        exitStatus,
        lastRun,
      } = this._rows;

      if (derivedState.mode === "failed") {
        this._titleItem.label.text = _("Automatic update failed");
      } else if (derivedState.mode === "completed") {
        this._titleItem.label.text = _("Automatic update finished");
      } else {
        this._titleItem.label.text = _("System update in progress");
      }

      this._setRowVisible(
        currentState,
        _("Current state"),
        formatServiceStateLabel(state.serviceActiveState, state.serviceSubState)
      );
      this._setRowVisible(
        elapsed,
        _("Elapsed"),
        derivedState.mode === "updating"
          ? formatElapsedDuration(state.serviceActiveEnterTimestamp)
          : null
      );
      this._setRowVisible(
        automaticUpdates,
        _("Automatic updates"),
        derivedState.timerEnabled ? _("Enabled") : _("Disabled")
      );
      this._setRowVisible(
        nextCheck,
        _("Next scheduled check"),
        formatTimestamp(state.timerNextElapseUSecRealtime)
      );
      this._setRowVisible(
        lastTrigger,
        _("Last timer trigger"),
        formatTimestamp(state.timerLastTriggerUSec)
      );
      this._setRowVisible(
        serviceResult,
        _("Service result"),
        derivedState.mode === "failed" ? state.serviceResult : null
      );
      this._setRowVisible(
        exitStatus,
        _("Exit status"),
        derivedState.mode === "failed" && state.serviceExecMainStatus !== null
          ? state.serviceExecMainStatus
          : null
      );
      this._setRowVisible(
        lastRun,
        _("Last run"),
        derivedState.mode === "failed"
          ? formatTimestamp(state.serviceInactiveEnterTimestamp)
          : derivedState.mode === "completed"
            ? formatTimestamp(state.serviceInactiveEnterTimestamp)
            : null
      );
      this._hintRow.item.visible = derivedState.mode === "failed";
      this._hintRow.label.text = derivedState.mode === "failed"
        ? _("Run `just logs` in the repository or check `journalctl -u uupd.service` for details.")
        : "";

      this._dismissItem.visible = derivedState.mode === "failed";
    }

    _updateSessionSignals(state) {
      const currentState = state.serviceActiveState ?? state.serviceState ?? null;
      const previousState = this._lastObservedServiceState;

      if (previousState === "active" || previousState === "activating") {
        if (currentState === "inactive" || currentState === "deactivating") {
          this._showCompletedState = true;
          this._startCompletedVisibilityTimer();
        }
      }

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
        hasObservedCompletion: this._showCompletedState,
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
      this._stopCompletedVisibilityTimer();

      if (this._providerChangedId && this._provider) {
        this._provider.disconnect(this._providerChangedId);
        this._providerChangedId = null;
      }

      this._provider?.destroy();
      this._provider = null;
      this._testProvider = null;
      super.destroy();
    }
  }
);

export default class UupdIndicatorExtension extends Extension {
  constructor(metadata) {
    super(metadata);
  }

  enable() {
    this._indicator = new UupdIndicator();
    Main.panel.addToStatusArea(this.uuid, this._indicator);
  }

  disable() {
    if (!this._indicator)
      return;

    this._indicator.destroy();
    this._indicator = null;
  }
}
