import GLib from "gi://GLib";

import {
  checkDeploymentStatus,
  parseBootcJson,
  parseRpmOstreeJson,
  runCommandOutput,
} from "../uupd-indicator@projectbluefin.io/lib/deploymentStatusProvider.js";

function assert(condition, message) {
  if (!condition)
    throw new Error(message);
}

// --- parseBootcJson ---

assert(
  parseBootcJson({ status: { staged: null, booted: {} } }) === "clean",
  "bootc: null staged means clean"
);

assert(
  parseBootcJson({ status: { staged: { image: {} }, booted: {} } }) === "reboot-required",
  "bootc: non-null staged means reboot-required"
);

assert(
  parseBootcJson({ status: { booted: {} } }) === "unknown",
  "bootc: missing staged key means unknown"
);

assert(
  parseBootcJson({ status: null }) === "unknown",
  "bootc: null status means unknown"
);

assert(
  parseBootcJson({}) === "unknown",
  "bootc: missing status means unknown"
);

assert(
  parseBootcJson(null) === "unknown",
  "bootc: null input means unknown"
);

assert(
  parseBootcJson("not an object") === "unknown",
  "bootc: string input means unknown"
);

// --- parseRpmOstreeJson ---

assert(
  parseRpmOstreeJson({ deployments: [{ booted: true }] }) === "clean",
  "rpm-ostree: first deployment booted=true means clean"
);

assert(
  parseRpmOstreeJson({ deployments: [{ booted: false }, { booted: true }] }) === "reboot-required",
  "rpm-ostree: first deployment booted=false + another booted deployment means reboot-required"
);

assert(
  parseRpmOstreeJson({ deployments: [{ booted: false }] }) === "unknown",
  "rpm-ostree: first deployment booted=false with no other booted deployment means unknown"
);

assert(
  parseRpmOstreeJson({ deployments: [{ booted: false }, { booted: false }] }) === "unknown",
  "rpm-ostree: no booted deployment among multiple means unknown"
);

assert(
  parseRpmOstreeJson({ deployments: [] }) === "unknown",
  "rpm-ostree: empty deployments array means unknown"
);

assert(
  parseRpmOstreeJson({ deployments: [{ checksum: "abc" }] }) === "unknown",
  "rpm-ostree: missing booted field means unknown"
);

assert(
  parseRpmOstreeJson({ deployments: [{ booted: "yes" }] }) === "unknown",
  "rpm-ostree: non-boolean booted means unknown"
);

assert(
  parseRpmOstreeJson({}) === "unknown",
  "rpm-ostree: missing deployments key means unknown"
);

assert(
  parseRpmOstreeJson(null) === "unknown",
  "rpm-ostree: null input means unknown"
);

assert(
  parseRpmOstreeJson({ deployments: null }) === "unknown",
  "rpm-ostree: null deployments means unknown"
);

class FakeCancellable {
  constructor() {
    this._cancelled = false;
    this._listeners = new Map();
    this._nextId = 1;
  }

  cancel() {
    if (this._cancelled)
      return;

    this._cancelled = true;

    for (const callback of this._listeners.values())
      callback();
  }

  connect(callback) {
    const id = this._nextId++;
    this._listeners.set(id, callback);

    if (this._cancelled)
      callback();

    return id;
  }

  disconnect(id) {
    this._listeners.delete(id);
  }

  is_cancelled() {
    return this._cancelled;
  }
}

// --- checkDeploymentStatus: missing-command handling ---
// This sandbox/CI runner does not have bootc or rpm-ostree installed, which lets us
// verify the missing-command path silently skips both checks without warning.

if (!GLib.find_program_in_path("bootc") && !GLib.find_program_in_path("rpm-ostree")) {
  // console.warn is read-only in this gjs environment and cannot be stubbed, so this
  // only verifies the resolved status; absence of warning output is checked by reading
  // the test's own stderr output manually (no Gjs-WARNING lines for "bootc"/"rpm-ostree").
  const result = await checkDeploymentStatus();

  assert(
    result.status === "unknown" && result.source === null,
    "checkDeploymentStatus should report unknown/null source when neither tool is installed"
  );
} else {
  console.warn(
    "[uupd-indicator tests] Skipping missing-command test: bootc or rpm-ostree is installed on this runner"
  );
}

// --- checkDeploymentStatus: cancellation stops fallback ---
{
  const calls = [];
  const cancellable = new FakeCancellable();

  const runPromise = checkDeploymentStatus(cancellable, {
    findProgramInPath(command) {
      return command === "bootc" || command === "rpm-ostree";
    },
    async runCommandOutputFn(argv, commandCancellable) {
      calls.push(argv[0]);

      if (argv[0] === "rpm-ostree")
        throw new Error("rpm-ostree fallback should not run after cancellation");

      return new Promise((_resolve, reject) => {
        commandCancellable.connect(() => reject(new Error("cancelled")));
      });
    },
  });

  cancellable.cancel();

  let rejected = false;

  try {
    await runPromise;
  } catch (error) {
    rejected = true;
    assert(error.message === "cancelled", "Cancelled bootc probe should reject as cancelled");
  }

  assert(rejected, "Cancelled deployment check should reject");
  assert(calls.length === 1 && calls[0] === "bootc", "Cancelled bootc probe should not start rpm-ostree fallback");
}

// --- runCommandOutput: timeout/cancellation cleanup ---
{
  const activeSourceIds = new Set();
  let nextSourceId = 1;
  let timeoutCallback = null;
  let sourceRemoveCalls = 0;
  let forceExitCalls = 0;
  let disconnectCalls = 0;

  const fakeGLib = {
    PRIORITY_DEFAULT: 0,
    SOURCE_REMOVE: false,
    timeout_add(_priority, _timeoutMs, callback) {
      const id = nextSourceId++;
      activeSourceIds.add(id);
      timeoutCallback = () => {
        activeSourceIds.delete(id);
        return callback();
      };
      return id;
    },
    source_remove(id) {
      sourceRemoveCalls++;

      if (!activeSourceIds.delete(id))
        throw new Error(`source_remove called with invalid id ${id}`);

      return true;
    },
  };

  const fakeGio = {
    Cancellable: class extends FakeCancellable {
      disconnect(id) {
        disconnectCalls++;
        super.disconnect(id);
      }
    },
    SubprocessFlags: {
      STDOUT_PIPE: 1,
      STDERR_SILENCE: 2,
    },
  };

  const runPromise = runCommandOutput(["fake-command"], null, {
    glib: fakeGLib,
    gio: fakeGio,
    commandTimeoutMs: 1,
    subprocessFactory() {
      return {
        async communicate_utf8_async(_stdin, cancellable) {
          return new Promise((resolve, reject) => {
            cancellable.connect(() => reject(new Error("cancelled")));
          });
        },
        force_exit() {
          forceExitCalls++;
        },
      };
    },
  });

  assert(timeoutCallback !== null, "runCommandOutput should register a timeout source");
  timeoutCallback();

  let rejected = false;

  try {
    await runPromise;
  } catch (error) {
    rejected = true;
    assert(error.message === "cancelled", "Timed out command should reject with cancellation");
  }

  assert(rejected, "Timed out command should reject");
  assert(sourceRemoveCalls === 0, "Expired timeout source should not be removed again in finally");
  assert(forceExitCalls >= 1, "Cancelled timed out command should force-exit the subprocess");
  assert(disconnectCalls === 1, "runCommandOutput should disconnect its cancellable handler during cleanup");
}
