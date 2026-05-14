import Gio from "gi://Gio";
import GLib from "gi://GLib";

export const SETTINGS_SCHEMA_ID = "org.gnome.shell.extensions.uupd-indicator";
export const SETTINGS_SCHEMA_PATH = "/org/gnome/shell/extensions/uupd-indicator/";
export const VISIBILITY_MODE_KEY = "visibility-mode";
export const VISIBILITY_MODE_AUTO = "auto";
export const VISIBILITY_MODE_ALWAYS = "always";

let schemaWarningLogged = false;

function logSchemaWarning(message) {
  if (schemaWarningLogged)
    return;

  schemaWarningLogged = true;
  console.warn(`[uupd-indicator] ${message}`);
}

function coerceVisibilityMode(value) {
  return value === VISIBILITY_MODE_ALWAYS
    ? VISIBILITY_MODE_ALWAYS
    : VISIBILITY_MODE_AUTO;
}

function createFallbackSettings() {
  const listeners = new Map();
  let nextListenerId = 1;
  let visibilityMode = VISIBILITY_MODE_AUTO;

  return {
    getVisibilityMode() {
      return visibilityMode;
    },
    setVisibilityMode(nextMode) {
      visibilityMode = coerceVisibilityMode(nextMode);
      for (const callback of listeners.values())
        callback();
    },
    connect(signal, callback) {
      if (signal !== `changed::${VISIBILITY_MODE_KEY}`)
        return 0;

      const id = nextListenerId++;
      listeners.set(id, callback);
      return id;
    },
    disconnect(id) {
      listeners.delete(id);
    },
    destroy() {
      listeners.clear();
    },
  };
}

function createSettingsFacade(settings) {
  return {
    getVisibilityMode() {
      try {
        return coerceVisibilityMode(settings.get_string(VISIBILITY_MODE_KEY));
      } catch (error) {
        logSchemaWarning(`Failed to read ${VISIBILITY_MODE_KEY}: ${error.message}`);
        return VISIBILITY_MODE_AUTO;
      }
    },
    setVisibilityMode(nextMode) {
      settings.set_string(VISIBILITY_MODE_KEY, coerceVisibilityMode(nextMode));
    },
    connect(signal, callback) {
      return settings.connect(signal, callback);
    },
    disconnect(id) {
      if (id)
        settings.disconnect(id);
    },
    destroy() {
    },
    raw: settings,
  };
}

function createSettingsFromLocalSchemaDir(extensionDir) {
  const schemaDir = GLib.build_filenamev([extensionDir, "schemas"]);
  const parent = Gio.SettingsSchemaSource.get_default();
  const source = Gio.SettingsSchemaSource.new_from_directory(schemaDir, parent, false);
  const schema = source?.lookup(SETTINGS_SCHEMA_ID, true);

  if (!schema)
    throw new Error(`schema ${SETTINGS_SCHEMA_ID} was not found in ${schemaDir}`);

  return new Gio.Settings({
    settings_schema: schema,
    path: SETTINGS_SCHEMA_PATH,
  });
}

export function createExtensionSettings(extension) {
  try {
    return createSettingsFacade(extension.getSettings(SETTINGS_SCHEMA_ID));
  } catch (defaultError) {
    try {
      return createSettingsFacade(createSettingsFromLocalSchemaDir(extension.path));
    } catch (localError) {
      logSchemaWarning(
        `Settings schema is unavailable; falling back to ${VISIBILITY_MODE_AUTO}. `
        + `Default lookup failed: ${defaultError.message}. Local lookup failed: ${localError.message}`
      );
      return createFallbackSettings();
    }
  }
}

export function getVisibilityMode(settings) {
  return settings?.getVisibilityMode?.() ?? VISIBILITY_MODE_AUTO;
}
