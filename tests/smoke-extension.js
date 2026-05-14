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

export function* run() {
  yield Scripting.waitLeisure();

  const indicator = getIndicator();
  assert(indicator, "Indicator was not added to Main.panel.statusArea");
  assert(typeof indicator.setStateForTesting === "function", "Indicator does not expose the expected smoke-test seam");

  indicator.setStateForTesting({
    timerEnabled: false,
    serviceState: "active",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(false, "Indicator should be hidden when timer is disabled and service is active");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "active",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should be visible when timer is enabled and service is active");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "activating",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(true, "Indicator should be visible when timer is enabled and service is activating");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "inactive",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(false, "Indicator should be hidden when timer is enabled and service is inactive");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: "failed",
  });
  yield Scripting.waitLeisure();
  assertIndicatorVisibility(false, "Indicator should be hidden when timer is enabled and service is failed");

  indicator.setStateForTesting({
    timerEnabled: true,
    serviceState: null,
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
}

export function finish() {
  GLib.test_message(`${UUID} smoke test finished`);
}
