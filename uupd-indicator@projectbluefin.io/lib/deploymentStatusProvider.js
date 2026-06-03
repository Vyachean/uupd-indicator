import Gio from "gi://Gio";
import GLib from "gi://GLib";

Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async", "communicate_utf8_finish");

const COMMAND_TIMEOUT_MS = 10000;

async function runCommandOutput(argv) {
  const cancellable = new Gio.Cancellable();
  const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COMMAND_TIMEOUT_MS, () => {
    cancellable.cancel();
    return GLib.SOURCE_REMOVE;
  });

  try {
    const proc = Gio.Subprocess.new(
      argv,
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
    );
    const [stdout] = await proc.communicate_utf8_async(null, cancellable);

    if (!proc.get_successful())
      throw new Error(`${argv[0]} exited with status ${proc.get_exit_status()}`);

    return stdout ?? "";
  } finally {
    GLib.source_remove(timeoutId);
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

  return defaultDeployment.booted ? "clean" : "reboot-required";
}

export async function checkDeploymentStatus() {
  const checkedAt = Date.now();

  try {
    const stdout = await runCommandOutput(["bootc", "status", "--json"]);
    const json = JSON.parse(stdout);
    const status = parseBootcJson(json);

    if (status !== "unknown")
      return { status, source: "bootc", checkedAt, error: null };
  } catch (error) {
    const msg = error?.message ?? String(error);

    if (!msg.includes("No such file") && !msg.includes("ENOENT"))
      console.warn(`[uupd-indicator] bootc status check failed: ${msg}`);
  }

  try {
    const stdout = await runCommandOutput(["rpm-ostree", "status", "--json"]);
    const json = JSON.parse(stdout);
    const status = parseRpmOstreeJson(json);

    if (status !== "unknown")
      return { status, source: "rpm-ostree", checkedAt, error: null };
  } catch (error) {
    const msg = error?.message ?? String(error);

    if (!msg.includes("No such file") && !msg.includes("ENOENT"))
      console.warn(`[uupd-indicator] rpm-ostree status check failed: ${msg}`);
  }

  return { status: "unknown", source: null, checkedAt, error: null };
}
