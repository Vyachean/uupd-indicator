/*
 * License: GPLv3
 * Authors:
 *  Universal Blue Contributors
 * Based on: VanillaOS Update Check Extension
 * Copyright: 2025
 */

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { UupdIndicator } from "./lib/indicator.js";
import { createExtensionSettings, getShowRebootRequired, SHOW_REBOOT_REQUIRED_KEY } from "./lib/settings.js";
import { isServiceUpdating } from "./lib/state.js";
import { SystemdUupdStateProvider } from "./lib/systemdProvider.js";
import { checkDeploymentStatus } from "./lib/deploymentStatusProvider.js";

function createDeploymentStatusCoordinator(provider, settings) {
  let destroyed = false;
  let checking = false;
  let prevServiceUpdating = false;

  async function check() {
    if (destroyed || checking)
      return;

    if (!getShowRebootRequired(settings))
      return;

    checking = true;

    try {
      const result = await checkDeploymentStatus();

      if (!destroyed)
        provider.updateDeploymentStatus(result);
    } catch (error) {
      console.warn(`[uupd-indicator] Deployment status check error: ${error.message}`);
    } finally {
      checking = false;
    }
  }

  const stateSignalId = provider.connect("state-changed", () => {
    const state = provider.getState();
    const nowUpdating = isServiceUpdating(state.serviceActiveState);

    if (prevServiceUpdating && !nowUpdating)
      check();

    prevServiceUpdating = nowUpdating;
  });

  const settingsSignalId = settings?.connect(`changed::${SHOW_REBOOT_REQUIRED_KEY}`, () => {
    if (getShowRebootRequired(settings))
      check();
  });

  check();

  return {
    destroy() {
      destroyed = true;
      provider.disconnect(stateSignalId);

      if (settingsSignalId)
        settings?.disconnect(settingsSignalId);
    },
  };
}

export default class UupdIndicatorExtension extends Extension {
  enable() {
    this._settings = createExtensionSettings(this);
    this._provider = new SystemdUupdStateProvider();
    this._deploymentCoordinator = createDeploymentStatusCoordinator(this._provider, this._settings);
    this._indicator = new UupdIndicator({
      provider: this._provider,
      settings: this._settings,
    });
    Main.panel.addToStatusArea(this.uuid, this._indicator);
  }

  disable() {
    this._deploymentCoordinator?.destroy();
    this._deploymentCoordinator = null;
    this._indicator?.destroy();
    this._indicator = null;
    this._provider = null;
    this._settings?.destroy?.();
    this._settings = null;
  }
}
