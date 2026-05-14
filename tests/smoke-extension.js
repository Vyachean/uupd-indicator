import GLib from "gi://GLib";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as Scripting from "resource:///org/gnome/shell/ui/scripting.js";

const UUID = "uupd-indicator@projectbluefin.io";

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

  yield Scripting.sleep(50);
  disableExtension();
  yield Scripting.waitLeisure();

  const removedIndicator = getIndicator();
  assert(!removedIndicator, "Indicator should be removed from status area after disable");
  assert(indicator._destroyed === true, "Indicator should be destroyed after disable");
  assert(indicator._iconAnimation === null, "Indicator animation should be cleaned up after disable");
  assert(indicator._completedVisibilitySource === null, "Completed-state timeout source should be cleaned up after disable");
}

export function finish() {
  GLib.test_message(`${UUID} smoke test finished`);
}
