import {
  createDeploymentStatusCoordinator,
} from "../uupd-indicator@projectbluefin.io/lib/deploymentStatusCoordinator.js";
import {
  createFallbackSettings,
} from "../uupd-indicator@projectbluefin.io/lib/settings.js";

function assert(condition, message) {
  if (!condition)
    throw new Error(message);
}

function flushMicrotasks() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function createProvider(initialActiveState = "inactive") {
  let serviceActiveState = initialActiveState;
  const listeners = new Map();
  let nextId = 1;
  const deploymentUpdates = [];

  return {
    getState() { return { serviceActiveState }; },
    setServiceActiveState(next) {
      serviceActiveState = next;
      for (const cb of listeners.values()) cb();
    },
    updateDeploymentStatus(s) { deploymentUpdates.push(s); },
    getDeploymentUpdates() { return deploymentUpdates; },
    connect(_signal, cb) {
      const id = nextId++;
      listeners.set(id, cb);
      return id;
    },
    disconnect(id) { listeners.delete(id); },
  };
}

// --- Test 1: Initial check runs on creation ---
{
  let checkCount = 0;
  const mockCheck = () => {
    checkCount++;
    return Promise.resolve({ status: "clean", source: "bootc", checkedAt: 1 });
  };

  const provider = createProvider();
  const settings = createFallbackSettings();
  const coordinator = createDeploymentStatusCoordinator(provider, settings, {
    checkDeploymentStatus: mockCheck,
  });

  assert(checkCount === 1, "Initial check should start immediately on creation");
  await flushMicrotasks();

  const updates = provider.getDeploymentUpdates();
  assert(updates.length === 1, "Initial check result should be applied");
  assert(updates[0].status === "clean", "Initial check result should be clean");

  coordinator.destroy();
}

// --- Test 2: Pending check deferred while another check is running ---
{
  const resolvers = [];
  let checkCount = 0;

  const mockCheck = () => {
    checkCount++;
    return new Promise(resolve => resolvers.push(resolve));
  };

  const provider = createProvider();
  const settings = createFallbackSettings();
  const coordinator = createDeploymentStatusCoordinator(provider, settings, {
    checkDeploymentStatus: mockCheck,
  });

  assert(checkCount === 1, "Initial check should start immediately");

  // Simulate: service goes active then back to inactive while initial check is still running
  provider.setServiceActiveState("active");
  provider.setServiceActiveState("inactive");

  assert(checkCount === 1, "Second check should not start while first is still running");

  // Resolve the first check
  resolvers[0]({ status: "reboot-required", source: "bootc", checkedAt: 1 });
  await flushMicrotasks();

  assert(checkCount === 2, "Pending check should run after first check completes");

  const updates = provider.getDeploymentUpdates();
  assert(updates.length >= 1, "First result should have been applied");
  assert(updates[0].status === "reboot-required", "First check result should be reboot-required");

  resolvers[1]({ status: "clean", source: "bootc", checkedAt: 2 });
  await flushMicrotasks();
  assert(updates.length === 2, "Second result should also be applied");

  coordinator.destroy();
}

// --- Test 3: Multiple pending requests collapse into one deferred check ---
{
  const resolvers = [];
  let checkCount = 0;

  const mockCheck = () => {
    checkCount++;
    return new Promise(resolve => resolvers.push(resolve));
  };

  const provider = createProvider();
  const settings = createFallbackSettings();
  const coordinator = createDeploymentStatusCoordinator(provider, settings, {
    checkDeploymentStatus: mockCheck,
  });

  // Trigger several check requests while initial is still running
  provider.setServiceActiveState("active");
  provider.setServiceActiveState("inactive");
  provider.setServiceActiveState("active");
  provider.setServiceActiveState("inactive");

  assert(checkCount === 1, "Only one check should be running, others should be collapsed into one pending");

  resolvers[0]({ status: "clean", source: "bootc", checkedAt: 1 });
  await flushMicrotasks();

  assert(checkCount === 2, "Exactly one pending check should run after first completes, not one per request");

  resolvers[1]({ status: "clean", source: "bootc", checkedAt: 2 });
  await flushMicrotasks();
  assert(checkCount === 2, "No further checks after the deferred one resolves");

  coordinator.destroy();
}

// --- Test 4: Result discarded if setting disabled while check runs ---
{
  const resolvers = [];

  const mockCheck = () => new Promise(resolve => resolvers.push(resolve));

  const provider = createProvider();
  const settings = createFallbackSettings();
  const coordinator = createDeploymentStatusCoordinator(provider, settings, {
    checkDeploymentStatus: mockCheck,
  });

  // Disable the setting while initial check is still pending
  settings.setShowRebootRequired(false);

  // The settings signal clears deployment status (unknown), then skips check()
  // because setting is now false.

  // Resolve the initial check — result should be ignored
  resolvers[0]({ status: "reboot-required", source: "bootc", checkedAt: 1 });
  await flushMicrotasks();

  const updates = provider.getDeploymentUpdates();
  const nonUnknown = updates.filter(u => u.status !== "unknown");
  assert(nonUnknown.length === 0, "Result should be discarded when setting is disabled during check");

  coordinator.destroy();
}

// --- Test 5: No check started when setting is disabled at creation ---
{
  let checkCount = 0;
  const mockCheck = () => {
    checkCount++;
    return Promise.resolve({ status: "clean", source: "bootc", checkedAt: 1 });
  };

  const provider = createProvider();
  const settings = createFallbackSettings();
  settings.setShowRebootRequired(false);

  const coordinator = createDeploymentStatusCoordinator(provider, settings, {
    checkDeploymentStatus: mockCheck,
  });

  await flushMicrotasks();
  assert(checkCount === 0, "No check should start when show-reboot-required is disabled");

  coordinator.destroy();
}

// --- Test 6: Destroyed coordinator does not apply results ---
{
  const resolvers = [];
  const cancellables = [];
  const mockCheck = cancellable => {
    cancellables.push(cancellable);
    return new Promise(resolve => resolvers.push(resolve));
  };

  const provider = createProvider();
  const settings = createFallbackSettings();
  const coordinator = createDeploymentStatusCoordinator(provider, settings, {
    checkDeploymentStatus: mockCheck,
  });

  coordinator.destroy();
  assert(cancellables.length === 1, "Destroy test should start exactly one check");
  assert(cancellables[0].is_cancelled(), "Destroy should cancel the active deployment check");

  resolvers[0]({ status: "reboot-required", source: "bootc", checkedAt: 1 });
  await flushMicrotasks();

  const nonUnknown = provider.getDeploymentUpdates().filter(u => u.status !== "unknown");
  assert(nonUnknown.length === 0, "Destroyed coordinator should not apply check result");
}

// --- Test 7: Destroy cancels a pending deployment check ---
{
  let capturedCancellable = null;
  let cancelSignalCount = 0;
  const mockCheck = cancellable => {
    capturedCancellable = cancellable;
    cancellable.connect(() => {
      cancelSignalCount++;
    });

    return new Promise(() => {
    });
  };

  const provider = createProvider();
  const settings = createFallbackSettings();
  const coordinator = createDeploymentStatusCoordinator(provider, settings, {
    checkDeploymentStatus: mockCheck,
  });

  assert(capturedCancellable !== null, "Coordinator should pass a cancellable to deployment checks");

  coordinator.destroy();

  assert(capturedCancellable.is_cancelled(), "Destroy should cancel the in-flight deployment check");
  assert(cancelSignalCount === 1, "Destroy should emit exactly one cancellation for the in-flight check");
}

// --- Test 8: Destroyed coordinator ignores cancelled check rejection ---
{
  const provider = createProvider();
  const settings = createFallbackSettings();
  const mockCheck = cancellable => new Promise((_resolve, reject) => {
    cancellable.connect(() => reject(new Error("cancelled")));
  });

  const coordinator = createDeploymentStatusCoordinator(provider, settings, {
    checkDeploymentStatus: mockCheck,
  });

  coordinator.destroy();
  await flushMicrotasks();

  const nonUnknown = provider.getDeploymentUpdates().filter(u => u.status !== "unknown");
  assert(nonUnknown.length === 0, "Destroyed coordinator should not apply cancelled check results");
}
