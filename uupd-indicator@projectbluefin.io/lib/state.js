import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import {
  VISIBILITY_MODE_ALWAYS,
  VISIBILITY_MODE_AUTO,
} from "./settings.js";

export function createInitialState() {
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

export function isTimerEnabled(state) {
  return state.timerUnitFileState === "enabled"
    || state.timerUnitFileState === "enabled-runtime"
    || state.timerEnabled === true;
}

export function isServiceUpdating(serviceActiveState) {
  return serviceActiveState === "active" || serviceActiveState === "activating";
}

export function isServiceFailed(serviceActiveState) {
  return serviceActiveState === "failed";
}

export function formatServiceStateLabel(activeState, subState) {
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

function getServiceStateIconName(mode) {
  switch (mode) {
  case "failed":
    return "dialog-warning-symbolic";
  case "updating":
  case "idle":
  default:
    return "folder-download-symbolic";
  }
}

function shouldPulseIcon(mode) {
  return mode === "updating";
}

export function deriveIndicatorState(state, options = {}) {
  const timerEnabled = isTimerEnabled(state);
  const serviceActiveState = state.serviceActiveState ?? state.serviceState ?? null;
  const serviceFailed = isServiceFailed(serviceActiveState);
  const serviceUpdating = isServiceUpdating(serviceActiveState);
  const failureDismissed = Boolean(options.failureDismissed);
  const visibilityMode = options.visibilityMode === VISIBILITY_MODE_ALWAYS
    ? VISIBILITY_MODE_ALWAYS
    : VISIBILITY_MODE_AUTO;

  let mode = "hidden";

  if (serviceUpdating && timerEnabled) {
    mode = "updating";
  } else if (serviceFailed && !failureDismissed) {
    mode = "failed";
  } else if (visibilityMode === VISIBILITY_MODE_ALWAYS) {
    mode = "idle";
  }

  return {
    mode,
    visible: mode !== "hidden",
    pulsing: shouldPulseIcon(mode),
    timerEnabled,
    serviceActiveState,
    serviceFailed,
    serviceUpdating,
    visibilityMode,
    iconName: getServiceStateIconName(mode),
  };
}
