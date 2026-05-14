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
const DBUS_PATH = "/org/freedesktop/systemd1/unit/uupd_2eservice";
const DBUS_INTERFACE = "org.freedesktop.systemd1.Unit";
const DBUS_TIMER_PATH = "/org/freedesktop/systemd1/unit/uupd_2etimer";
// Bluefin exposes uupd.timer and uupd.service as system units.
const DBUS_CONNECTION = Gio.DBus.system;
const DEBUG = false;

function debug(message) {
  if (DEBUG)
    console.debug(`[uupd-indicator] ${message}`);
}

function unpackMaybeVariant(value) {
  return value && typeof value.deep_unpack === "function"
    ? value.deep_unpack()
    : value;
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
      this._state = {
        timerEnabled: false,
        serviceState: null,
      };
    }

    start() {
    }

    destroy() {
    }

    getState() {
      return { ...this._state };
    }

    _setState(nextState) {
      const timerEnabled = Boolean(nextState.timerEnabled);
      const serviceState = nextState.serviceState ?? null;

      if (this._state.timerEnabled === timerEnabled
        && this._state.serviceState === serviceState) {
        return;
      }

      this._state = {
        timerEnabled,
        serviceState,
      };
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
      this._serviceProxy = null;
      this._timerProxy = null;
      this._servicePropertiesChangedId = null;
      this._timerPropertiesChangedId = null;
    }

    start() {
      this._initTimerProxy();
      this._initServiceProxy();
    }

    destroy() {
      this._destroyed = true;
      this._initCancellable?.cancel();

      if (this._servicePropertiesChangedId && this._serviceProxy) {
        this._serviceProxy.disconnect(this._servicePropertiesChangedId);
        this._servicePropertiesChangedId = null;
      }

      if (this._timerPropertiesChangedId && this._timerProxy) {
        this._timerProxy.disconnect(this._timerPropertiesChangedId);
        this._timerPropertiesChangedId = null;
      }

      this._initCancellable = null;
      this._serviceProxy = null;
      this._timerProxy = null;
    }

    _initTimerProxy() {
      this._timerProxy = new Gio.DBusProxy({
        g_connection: DBUS_CONNECTION,
        g_name: DBUS_NAME,
        g_object_path: DBUS_TIMER_PATH,
        g_interface_name: DBUS_INTERFACE,
      });

      this._timerProxy.init_async(
        GLib.PRIORITY_DEFAULT,
        this._initCancellable,
        (proxy, result) => {
          if (this._destroyed)
            return;

          try {
            proxy.init_finish(result);
            this._timerPropertiesChangedId = this._timerProxy.connect(
              "g-properties-changed",
              this._onTimerPropertiesChanged.bind(this)
            );
            this._refreshTimerState();
          } catch (e) {
            if (this._isCancelledError(e))
              return;

            console.warn(`[uupd-indicator] Failed to initialize timer proxy: ${e.message}`);
            this._timerProxy = null;
            this._setState({
              ...this.getState(),
              timerEnabled: false,
            });
          }
        }
      );
    }

    _initServiceProxy() {
      this._serviceProxy = new Gio.DBusProxy({
        g_connection: DBUS_CONNECTION,
        g_name: DBUS_NAME,
        g_object_path: DBUS_PATH,
        g_interface_name: DBUS_INTERFACE,
      });

      this._serviceProxy.init_async(
        GLib.PRIORITY_DEFAULT,
        this._initCancellable,
        (proxy, result) => {
          if (this._destroyed)
            return;

          try {
            proxy.init_finish(result);
            this._servicePropertiesChangedId = this._serviceProxy.connect(
              "g-properties-changed",
              this._onServicePropertiesChanged.bind(this)
            );
            this._refreshServiceState();
          } catch (e) {
            if (this._isCancelledError(e))
              return;

            console.warn(`[uupd-indicator] Failed to initialize service proxy: ${e.message}`);
            this._serviceProxy = null;
            this._setState({
              ...this.getState(),
              serviceState: null,
            });
          }
        }
      );
    }

    _isCancelledError(error) {
      return typeof error.matches === "function"
        && error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED);
    }

    _refreshTimerState() {
      if (!this._timerProxy)
        return;

      const unitFileState = this._timerProxy.get_cached_property("UnitFileState");
      const timerEnabled = unitFileState?.deep_unpack() === "enabled";

      debug(`Timer state: ${unitFileState?.deep_unpack?.() ?? "unknown"}`);
      this._setState({
        ...this.getState(),
        timerEnabled,
      });
    }

    _refreshServiceState() {
      if (!this._serviceProxy)
        return;

      const activeState = this._serviceProxy.get_cached_property("ActiveState");
      const serviceState = unpackMaybeVariant(activeState);

      if (serviceState)
        debug(`Service state: ${serviceState}`);

      this._setState({
        ...this.getState(),
        serviceState,
      });
    }

    _onTimerPropertiesChanged() {
      if (this._destroyed)
        return;

      this._refreshTimerState();
    }

    _onServicePropertiesChanged(_proxy, changed) {
      if (this._destroyed)
        return;

      const changedProps = changed.deep_unpack();

      if ("ActiveState" in changedProps) {
        this._setState({
          ...this.getState(),
          serviceState: unpackMaybeVariant(changedProps.ActiveState),
        });
      }
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

      this._icon = new St.Icon({
        icon_name: "folder-download-symbolic",
        style_class: "system-status-icon",
      });
      this.add_child(this._icon);

      let msgUpdateItem = new PopupMenu.PopupMenuItem(
        _("System update in progress...")
      );
      msgUpdateItem.setSensitive(false);
      this.menu.addMenuItem(msgUpdateItem);

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

    _updateIndicatorState() {
      if (this._destroyed)
        return;

      const { timerEnabled, serviceState } = this._provider?.getState() ?? {
        timerEnabled: false,
        serviceState: null,
      };

      if (!timerEnabled) {
        this._stopIconAnimation();
        this.hide();
        return;
      }

      if (!serviceState) {
        this._stopIconAnimation();
        this.hide();
        return;
      }

      if (serviceState === "active" || serviceState === "activating") {
        this.show();
        this._startIconAnimation();
      } else {
        this._stopIconAnimation();
        this.hide();
      }
    }

    destroy() {
      this._destroyed = true;
      this._stopIconAnimation();

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
