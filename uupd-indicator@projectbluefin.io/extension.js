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

const UupdIndicator = GObject.registerClass(
  {
    GTypeName: "UupdIndicator",
  },
  class UupdIndicator extends PanelMenu.Button {
    _init() {
      super._init(0.0, _("Universal Blue Update Indicator"));
      this._destroyed = false;
      this._initCancellable = new Gio.Cancellable();
      this._proxy = null;
      this._timerProxy = null;
      this._propertiesChangedId = null;
      this._timerPropertiesChangedId = null;
      this._timerEnabled = false;
      this._serviceState = null;
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
      this._initDBusProxy();
    }

    _initDBusProxy() {
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
            this._updateIndicatorState();
          } catch (e) {
            if (this._isCancelledError(e))
              return;

            console.warn(`[uupd-indicator] Failed to initialize timer proxy: ${e.message}`);
            this._timerProxy = null;
            this._timerEnabled = false;
            this._updateIndicatorState();
          }
        }
      );

      this._proxy = new Gio.DBusProxy({
        g_connection: DBUS_CONNECTION,
        g_name: DBUS_NAME,
        g_object_path: DBUS_PATH,
        g_interface_name: DBUS_INTERFACE,
      });

      this._proxy.init_async(
        GLib.PRIORITY_DEFAULT,
        this._initCancellable,
        (proxy, result) => {
          if (this._destroyed)
            return;

          try {
            proxy.init_finish(result);
            this._propertiesChangedId = this._proxy.connect(
              "g-properties-changed",
              this._onPropertiesChanged.bind(this)
            );
            this._refreshServiceState();
            this._updateIndicatorState();
          } catch (e) {
            if (this._isCancelledError(e))
              return;

            console.warn(`[uupd-indicator] Failed to initialize service proxy: ${e.message}`);
            this._proxy = null;
            this._serviceState = null;
            this._updateIndicatorState();
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
        return false;

      const unitFileState = this._timerProxy.get_cached_property("UnitFileState");

      if (!unitFileState) {
        this._timerEnabled = false;
        return false;
      }

      const state = unitFileState.deep_unpack();
      this._timerEnabled = state === "enabled";
      debug(`Timer state: ${state}`);
      return true;
    }

    _onTimerPropertiesChanged() {
      if (this._destroyed)
        return;

      this._refreshTimerState();
      this._updateIndicatorState();
    }

    _refreshServiceState() {
      if (!this._proxy)
        return false;

      const activeState = this._proxy.get_cached_property("ActiveState");
      this._serviceState = unpackMaybeVariant(activeState);
      if (this._serviceState)
        debug(`Service state: ${this._serviceState}`);
      return activeState !== null;
    }

    _onPropertiesChanged(_proxy, changed) {
      if (this._destroyed)
        return;

      const changedProps = changed.deep_unpack();

      if ("ActiveState" in changedProps) {
        this._serviceState = unpackMaybeVariant(changedProps.ActiveState);
        this._updateIndicatorState();
      }
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

      if (!this._timerEnabled) {
        this._stopIconAnimation();
        this.hide();
        return;
      }

      if (!this._serviceState) {
        this._stopIconAnimation();
        this.hide();
        return;
      }

      if (this._serviceState === "active" || this._serviceState === "activating") {
        this.show();
        this._startIconAnimation();
      } else {
        this._stopIconAnimation();
        this.hide();
      }
    }

    destroy() {
      this._destroyed = true;
      this._initCancellable?.cancel();
      this._stopIconAnimation();

      if (this._propertiesChangedId && this._proxy) {
        this._proxy.disconnect(this._propertiesChangedId);
        this._propertiesChangedId = null;
      }

      if (this._timerPropertiesChangedId && this._timerProxy) {
        this._timerProxy.disconnect(this._timerPropertiesChangedId);
        this._timerPropertiesChangedId = null;
      }

      this._initCancellable = null;
      this._proxy = null;
      this._timerProxy = null;
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
