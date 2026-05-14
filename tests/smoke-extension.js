import GLib from "gi://GLib";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as Scripting from "resource:///org/gnome/shell/ui/scripting.js";

const UUID = "uupd-indicator@projectbluefin.io";
const VISIBILITY_AUTO = "auto";
const VISIBILITY_ALWAYS = "always";

function assert(condition, message) {
  if (!condition)
    throw new Error(message);
}

function getIndicator() {
  return Main.panel.statusArea[UUID] ?? null;
}

function disableExtension() {
  if (typeof Main.extensionManager?.disableExtension === "function") {
    const result = Main.extensionManager.disableExtension(UUID);

    if (result && typeof result.then === "function")
      throw new Error("disableExtension() returned a Promise; update the smoke script for this GNOME Shell build");

    return;
  }

  const extension = Main.extensionManager?.lookup?.(UUID)
    ?? Main.extensionManager?._extensions?.get?.(UUID)
    ?? null;

  if (extension?.stateObj && typeof extension.stateObj.disable === "function") {
    extension.stateObj.disable();
    return;
  }

  throw new Error("Could not disable extension through GNOME Shell extension manager");
}

function assertIndicatorVisibility(expectedVisible, message) {
  const indicator = getIndicator();
  assert(indicator, "Indicator should still be registered in Main.panel.statusArea");
  assert(indicator.visible === expectedVisible, message);
}

function assertIconName(expectedIconName, message) {
  const indicator = getIndicator();
  assert(indicator?._icon, "Indicator icon should exist");
  assert(indicator._icon.icon_name === expectedIconName, message);
}

function assertPulsing(expectedPulsing, message) {
  const indicator = getIndicator();
  assert(Boolean(indicator?._iconAnimation) === expectedPulsing, message);
}

export function* run() {
  yield Scripting.waitLeisure();

  const indicator = getIndicator();
  assert(indicator, "Indicator was not added to Main.panel.statusArea");
  assert(typeof indicator.setStateForTesting === "function", "Indicator does not expose the expected smoke-test seam");
  assert(typeof indicator.setVisibilityModeForTesting === "function", "Indicator does not expose the expected settings seam");

  indicator.setVisibilityModeForTesting(VISIBILITY_AUTO);
  indicator.setStateForTesting({
    timerEnabled: false,
    serviceState: "active",
    serviceActiveState: "active",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(false, "Indicator should be hidden when timer is disabled and service is active");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "active",
    serviceActiveState: "active",
    timerUnitFileState: "enabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should be visible when timer is enabled and service is active");
  assertPulsing(true, "Indicator should pulse when service is active");
  assertIconName("folder-download-symbolic", "Indicator should use the download icon while updating");

  indicator.setStateForTesting({
    timerEnabled: false,
    serviceState: "active",
    serviceActiveState: "active",
    timerUnitFileState: "static",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(false, "Indicator should not treat a static timer unit as updating without an explicit enabled fallback");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "activating",
    serviceActiveState: "activating",
    timerUnitFileState: "enabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should be visible when timer is enabled and service is activating");
  assertPulsing(true, "Indicator should pulse when service is activating");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "inactive",
    serviceActiveState: "inactive",
    timerUnitFileState: "enabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(false, "Indicator should be hidden when timer is enabled and service is inactive");
  assertPulsing(false, "Indicator should stop pulsing when service is inactive");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "failed",
    serviceActiveState: "failed",
    serviceResult: "exit-code",
    serviceExecMainStatus: 1,
    timerUnitFileState: "enabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should be visible when timer is enabled and service is failed");
  assertPulsing(false, "Indicator should not pulse when service is failed");
  assertIconName("dialog-warning-symbolic", "Indicator should use the warning icon when service is failed");

  indicator._dismissItem.activate(0);
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(false, "Indicator should hide failed state after dismiss for the current session");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "inactive",
    serviceActiveState: "inactive",
    timerUnitFileState: "enabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(false, "Indicator should remain hidden after a non-failed state change");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "failed",
    serviceActiveState: "failed",
    serviceResult: "exit-code",
    serviceExecMainStatus: 2,
    timerUnitFileState: "enabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should surface failure again after service state changes and fails again");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: null,
    serviceActiveState: null,
    timerUnitFileState: "enabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(false, "Indicator should be hidden when timer is enabled and service state is missing");

  indicator.setVisibilityModeForTesting(VISIBILITY_ALWAYS);
  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "inactive",
    serviceActiveState: "inactive",
    timerUnitFileState: "enabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should stay visible in always mode when service is inactive");
  assertPulsing(false, "Indicator should not pulse in always-mode idle state");
  assertIconName("folder-download-symbolic", "Indicator should use the idle download icon in always mode");

  indicator.setStateForTesting({
    timerEnabled: false,
    serviceState: "inactive",
    serviceActiveState: "inactive",
    timerUnitFileState: "disabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should stay visible in always mode when automatic updates are disabled");
  assertPulsing(false, "Indicator should not pulse when automatic updates are disabled");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "active",
    serviceActiveState: "active",
    timerUnitFileState: "enabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should remain visible while updating in always mode");
  assertPulsing(true, "Indicator should pulse while updating in always mode");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "activating",
    serviceActiveState: "activating",
    timerUnitFileState: "enabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should remain visible while activating in always mode");
  assertPulsing(true, "Indicator should pulse while activating in always mode");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "failed",
    serviceActiveState: "failed",
    serviceResult: "exit-code",
    serviceExecMainStatus: 3,
    timerUnitFileState: "enabled",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should show failed state in always mode");
  assertPulsing(false, "Indicator should not pulse when failed in always mode");
  assertIconName("dialog-warning-symbolic", "Indicator should use the warning icon in always mode");

  indicator._dismissItem.activate(0);
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Dismiss in always mode should keep the indicator visible");
  assertPulsing(false, "Dismiss in always mode should return to non-pulsing idle state");
  assertIconName("folder-download-symbolic", "Dismiss in always mode should clear the warning icon back to idle");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: null,
    serviceActiveState: null,
    timerUnitFileState: null,
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should stay visible in always mode when service state is missing");
  assertPulsing(false, "Indicator should stay idle in always mode when service state is missing");
  assertIconName("folder-download-symbolic", "Missing service state should use the idle icon in always mode");

  yield Scripting.sleep(50);
  disableExtension();
  yield Scripting.waitLeisure();

  const removedIndicator = getIndicator();
  assert(!removedIndicator, "Indicator should be removed from status area after disable");
  assert(indicator._destroyed === true, "Indicator should be destroyed after disable");
  assert(indicator._iconAnimation === null, "Indicator animation should be cleaned up after disable");
}

export function finish() {
  GLib.test_message(`${UUID} smoke test finished`);
}
