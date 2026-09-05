const {
  hasConfiguredWindows,
  normalizeDisplayPowerSchedule
} = require("./display-schedule-config");
const {
  evaluateDisplaySchedule
} = require("./display-schedule-evaluator");
const {
  AttentionOverrideRegistry
} = require("./attention-override-registry");
const {
  DisplayController
} = require("./display-controller");
const {
  resolveEffectiveDisplayState
} = require("./display-power-policy");
const {
  SimulatedDisplayPowerAdapter
} = require("./adapters/simulated-display-power-adapter");

function createDisplayPowerRuntime({
  schedule,
  adapter = new SimulatedDisplayPowerAdapter(),
  now = () => Date.now(),
  setTimeout: scheduleTimeout = setTimeout,
  clearTimeout: cancelTimeout = clearTimeout,
  retryDelays
} = {}) {
  let currentSchedule = normalizeDisplayPowerSchedule(schedule);
  const timerDependencies = {
    now,
    setTimeout: scheduleTimeout,
    clearTimeout: cancelTimeout
  };
  const overrideRegistry = new AttentionOverrideRegistry(timerDependencies);
  const controller = new DisplayController({
    schedule: currentSchedule,
    overrideRegistry,
    adapter,
    ...timerDependencies,
    ...(retryDelays ? { retryDelays } : {})
  });

  return {
    adapter,
    controller,
    overrideRegistry,

    start() {
      return controller.start();
    },

    stop() {
      controller.stop();
      overrideRegistry.stop();
    },

    updateSchedule(scheduleUpdate) {
      currentSchedule = normalizeDisplayPowerSchedule(scheduleUpdate);
      return controller.setSchedule(currentSchedule);
    },

    getStatus() {
      const evaluation = evaluateDisplaySchedule(
        currentSchedule,
        new Date(now())
      );
      const activeOverrides = overrideRegistry.getActive();
      const diagnostics = controller.getDiagnostics();

      return {
        running: diagnostics.status === "running",
        schedulingEnabled: currentSchedule.enabled,
        scheduleEmpty: !hasConfiguredWindows(currentSchedule),
        timeZone: currentSchedule.timeZone,
        baselineDesiredState: evaluation.baselineDesiredState,
        effectiveDesiredState: resolveEffectiveDisplayState(
          evaluation.baselineDesiredState,
          activeOverrides
        ),
        nextBoundary: evaluation.nextBoundary,
        attentionOverrideActive: activeOverrides.length > 0,
        activeOverrideCount: activeOverrides.length,
        lastSuccessfullyAppliedState:
          diagnostics.lastSuccessfullyAppliedState,
        adapterCapabilities: diagnostics.adapterCapabilities
      };
    }
  };
}

module.exports = { createDisplayPowerRuntime };
