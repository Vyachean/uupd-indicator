export function isServiceUpdating(serviceActiveState) {
  return serviceActiveState === "active" || serviceActiveState === "activating";
}

export function isServiceFailed(serviceActiveState) {
  return serviceActiveState === "failed";
}
