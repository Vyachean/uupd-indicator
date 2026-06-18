import Gio from "gi://Gio";
import GLib from "gi://GLib";

Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async", "communicate_utf8_finish");

const COMMAND_TIMEOUT_MS = 10000;

export async function runCommandOutput(argv, cancellable = null, {
  glib = GLib,
  gio = Gio,
  commandTimeoutMs = COMMAND_TIMEOUT_MS,
  subprocessFactory = (subprocessArgv, flags) => gio.Subprocess.new(subprocessArgv, flags),
} = {}) {
  const commandCancellable = cancellable ?? new gio.Cancellable();
  let proc = null;
  let timeoutId = glib.timeout_add(glib.PRIORITY_DEFAULT, commandTimeoutMs, () => {
    commandCancellable.cancel();
    timeoutId = 0;
    return glib.SOURCE_REMOVE;
  });
  const cancelSignalId = commandCancellable.connect(() => {
    proc?.force_exit();
  });

  try {
    proc = subprocessFactory(
      argv,
      gio.SubprocessFlags.STDOUT_PIPE | gio.SubprocessFlags.STDERR_SILENCE
    );
    const [stdout] = await proc.communicate_utf8_async(null, commandCancellable);

    if (!proc.get_successful())
      throw new Error(`${argv[0]} exited with status ${proc.get_exit_status()}`);

    return stdout ?? "";
  } catch (error) {
    if (commandCancellable.is_cancelled())
      proc?.force_exit();

    throw error;
  } finally {
    commandCancellable.disconnect(cancelSignalId);

    if (timeoutId > 0) {
      glib.source_remove(timeoutId);
      timeoutId = 0;
    }
  }
}

export function parseBootcJson(json) {
  const status = json?.status;

  if (!status || typeof status !== "object")
    return "unknown";

  if (!("staged" in status))
    return "unknown";

  return status.staged !== null && status.staged !== undefined
    ? "reboot-required"
    : "clean";
}

export function parseRpmOstreeJson(json) {
  const deployments = json?.deployments;

  if (!Array.isArray(deployments) || deployments.length === 0)
    return "unknown";

  const defaultDeployment = deployments[0];

  if (typeof defaultDeployment?.booted !== "boolean")
    return "unknown";

  if (defaultDeployment.booted)
    return "clean";

  const hasBootedDeployment = deployments.some(d => d.booted === true);

  return hasBootedDeployment ? "reboot-required" : "unknown";
}

export async function checkDeploymentStatus(cancellable = null) {
  const checkedAt = Date.now();

  if (GLib.find_program_in_path("bootc")) {
    try {
      const stdout = await runCommandOutput(["bootc", "status", "--json"], cancellable);
      const json = JSON.parse(stdout);
      const status = parseBootcJson(json);

      if (status !== "unknown")
        return { status, source: "bootc", checkedAt };
    } catch (error) {
      const msg = error?.message ?? String(error);

      console.warn(`[uupd-indicator] bootc status check failed: ${msg}`);
    }
  }

  if (GLib.find_program_in_path("rpm-ostree")) {
    try {
      const stdout = await runCommandOutput(["rpm-ostree", "status", "--json"], cancellable);
      const json = JSON.parse(stdout);
      const status = parseRpmOstreeJson(json);

      if (status !== "unknown")
        return { status, source: "rpm-ostree", checkedAt };
    } catch (error) {
      const msg = error?.message ?? String(error);

      console.warn(`[uupd-indicator] rpm-ostree status check failed: ${msg}`);
    }
  }

  return { status: "unknown", source: null, checkedAt };
}
