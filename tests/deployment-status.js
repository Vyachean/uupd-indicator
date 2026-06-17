import GLib from "gi://GLib";

import {
  checkDeploymentStatus,
  parseBootcJson,
  parseRpmOstreeJson,
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
