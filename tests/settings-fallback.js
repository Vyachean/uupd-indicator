import {
  createFallbackSettings,
  getShowRebootRequired,
  SHOW_REBOOT_REQUIRED_KEY,
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
