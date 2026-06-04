import {
  createFallbackSettings,
  getShowRebootRequired,
  SHOW_REBOOT_REQUIRED_KEY,
  VISIBILITY_MODE_KEY,
} from "../uupd-indicator@projectbluefin.io/lib/settings.js";

function assert(condition, message) {
  if (!condition)
    throw new Error(message);
}

const settings = createFallbackSettings();

assert(getShowRebootRequired(null) === true, "Helper should default show-reboot-required to true when settings are unavailable");
assert(getShowRebootRequired(settings) === true, "Default show-reboot-required should be true");
assert(settings.getShowRebootRequired() === true, "Fallback settings should expose show-reboot-required as true by default");

let changedSignalCount = 0;
const changedId = settings.connect(`changed::${SHOW_REBOOT_REQUIRED_KEY}`, () => {
  changedSignalCount += 1;
});

assert(changedId > 0, "Fallback settings should accept changed::show-reboot-required listeners");

settings.setShowRebootRequired(false);
assert(settings.getShowRebootRequired() === false, "Fallback settings should store false for show-reboot-required");
assert(getShowRebootRequired(settings) === false, "Facade helper should read fallback show-reboot-required=false");
assert(changedSignalCount === 1, "Fallback settings should emit changed::show-reboot-required when toggled");

settings.setShowRebootRequired(true);
assert(settings.getShowRebootRequired() === true, "Fallback settings should store true for show-reboot-required");
assert(changedSignalCount === 2, "Fallback settings should emit changed::show-reboot-required on subsequent toggles");

settings.disconnect(changedId);
settings.destroy();

// --- Signal isolation ---

const s2 = createFallbackSettings();

let visibilityChangedCount = 0;
let rebootChangedCount = 0;

const visibilityId = s2.connect(`changed::${VISIBILITY_MODE_KEY}`, () => {
  visibilityChangedCount += 1;
});
const rebootId = s2.connect(`changed::${SHOW_REBOOT_REQUIRED_KEY}`, () => {
  rebootChangedCount += 1;
});

assert(visibilityId > 0, "Fallback settings should accept changed::visibility-mode listeners");
assert(rebootId > 0, "Fallback settings should accept changed::show-reboot-required listeners");
assert(visibilityId !== rebootId, "Each listener should get a unique id");

s2.setShowRebootRequired(false);
assert(rebootChangedCount === 1, "setShowRebootRequired should fire changed::show-reboot-required");
assert(visibilityChangedCount === 0, "setShowRebootRequired should not fire changed::visibility-mode");

s2.setVisibilityMode("always");
assert(visibilityChangedCount === 1, "setVisibilityMode should fire changed::visibility-mode");
assert(rebootChangedCount === 1, "setVisibilityMode should not fire changed::show-reboot-required");

s2.disconnect(visibilityId);
s2.setVisibilityMode("auto");
assert(visibilityChangedCount === 1, "Disconnected listener should not receive further notifications");
assert(rebootChangedCount === 1, "Unrelated listener should not be affected by disconnect");

s2.destroy();
