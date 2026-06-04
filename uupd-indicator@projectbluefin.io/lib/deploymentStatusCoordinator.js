import { isServiceUpdating } from "./predicates.js";
import { getShowRebootRequired, SHOW_REBOOT_REQUIRED_KEY } from "./settings.js";
import { checkDeploymentStatus as defaultCheckDeploymentStatus } from "./deploymentStatusProvider.js";

function clearDeploymentStatus(provider) {
  provider.updateDeploymentStatus({ status: "unknown", source: null, checkedAt: null });
}

export function createDeploymentStatusCoordinator(provider, settings, {
  checkDeploymentStatus = defaultCheckDeploymentStatus,
} = {}) {
  let destroyed = false;
  let checking = false;
  let pendingCheck = false;
  let prevServiceUpdating = false;

  async function check() {
    if (destroyed)
      return;

    if (checking) {
      pendingCheck = true;
      return;
    }

    if (!getShowRebootRequired(settings))
      return;

    checking = true;

    try {
      const result = await checkDeploymentStatus();

      if (!destroyed && getShowRebootRequired(settings))
        provider.updateDeploymentStatus(result);
    } catch (error) {
      console.warn(`[uupd-indicator] Deployment status check error: ${error.message}`);
    } finally {
      checking = false;

      if (pendingCheck) {
        pendingCheck = false;
        check();
      }
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
    clearDeploymentStatus(provider);

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
