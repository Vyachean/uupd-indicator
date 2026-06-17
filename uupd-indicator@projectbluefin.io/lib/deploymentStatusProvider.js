import Gio from "gi://Gio";
import GLib from "gi://GLib";

Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async", "communicate_utf8_finish");

const COMMAND_TIMEOUT_MS = 10000;

async function runCommandOutput(argv) {
  const cancellable = new Gio.Cancellable();
  let proc = null;
  let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COMMAND_TIMEOUT_MS, () => {
    cancellable.cancel();
    proc?.force_exit();
    timeoutId = 0;
    return GLib.SOURCE_REMOVE;
  });

  try {
    proc = Gio.Subprocess.new(
      argv,
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
    );
    const [stdout] = await proc.communicate_utf8_async(null, cancellable);

    if (!proc.get_successful())
      throw new Error(`${argv[0]} exited with status ${proc.get_exit_status()}`);

    return stdout ?? "";
  } finally {
    if (timeoutId > 0) {
      GLib.source_remove(timeoutId);
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

export async function checkDeploymentStatus() {
  const checkedAt = Date.now();

  if (GLib.find_program_in_path("bootc")) {
    try {
      const stdout = await runCommandOutput(["bootc", "status", "--json"]);
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
      const stdout = await runCommandOutput(["rpm-ostree", "status", "--json"]);
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
