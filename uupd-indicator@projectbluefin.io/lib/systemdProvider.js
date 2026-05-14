import GObject from "gi://GObject";
import Gio from "gi://Gio";
import GLib from "gi://GLib";

import { createInitialState, isTimerEnabled } from "./state.js";

const DBUS_NAME = "org.freedesktop.systemd1";
const DBUS_SERVICE_PATH = "/org/freedesktop/systemd1/unit/uupd_2eservice";
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

export const StateProvider = GObject.registerClass(
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

export const SystemdUupdStateProvider = GObject.registerClass(
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

export const FakeUupdStateProvider = GObject.registerClass(
  class FakeUupdStateProvider extends StateProvider {
    setState(nextState) {
      this._setState({
        ...this.getState(),
        ...nextState,
      });
    }
  }
);
