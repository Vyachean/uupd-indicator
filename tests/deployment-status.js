import {
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
  "rpm-ostree: first deployment booted=false means reboot-required"
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
