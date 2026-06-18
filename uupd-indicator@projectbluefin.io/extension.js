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
import { createExtensionSettings } from "./lib/settings.js";
import { SystemdUupdStateProvider } from "./lib/systemdProvider.js";
import { createDeploymentStatusCoordinator } from "./lib/deploymentStatusCoordinator.js";

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
