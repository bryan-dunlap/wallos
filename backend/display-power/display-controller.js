const {
  normalizeDisplayPowerSchedule
} = require("./display-schedule-config");
const {
  evaluateDisplaySchedule
} = require("./display-schedule-evaluator");
const {
  resolveEffectiveDisplayState
} = require("./display-power-policy");

const MAX_TIMER_DELAY = 2_147_000_000;

class DisplayController {
  constructor({
    schedule,
    overrideRegistry,
    adapter,
    now = () => Date.now(),
    setTimeout: scheduleTimeout = setTimeout,
    clearTimeout: cancelTimeout = clearTimeout,
    retryDelays = [1_000, 5_000, 30_000],
    evaluator = evaluateDisplaySchedule
  }) {
    if (!overrideRegistry || !adapter) {
      throw new Error("Display controller requires overrides and an adapter.");
    }

    this.schedule = normalizeDisplayPowerSchedule(schedule);
    this.overrideRegistry = overrideRegistry;
    this.adapter = adapter;
    this.now = now;
    this.scheduleTimeout = scheduleTimeout;
    this.cancelTimeout = cancelTimeout;
    this.retryDelays = retryDelays;
    this.evaluator = evaluator;
    this.started = false;
    this.generation = 0;
    this.boundaryTimer = null;
    this.retryTimer = null;
    this.unsubscribeOverrides = null;
    this.queue = Promise.resolve();
    this.lastSuccessfullyAppliedState = null;
    this.diagnostics = {
      status: "stopped",
      baselineDesiredState: null,
      effectiveDesiredState: null,
      activeOverrideCount: 0,
      nextBoundary: null,
      lastAttemptAt: null,
      lastSuccessfulApplyAt: null,
      lastSuccessfullyAppliedState: null,
      lastError: null,
      retryAt: null
    };
  }

  start() {
    if (this.started) return this.queue;

    this.started = true;
    this.diagnostics.status = "running";
    this.unsubscribeOverrides = this.overrideRegistry.subscribe(() => {
      this.requestReconciliation("override-change");
    });
    return this.requestReconciliation("startup", { force: true });
  }

  stop() {
    this.started = false;
    this.generation += 1;
    this.clearTimers();
    this.unsubscribeOverrides?.();
    this.unsubscribeOverrides = null;
    this.diagnostics.status = "stopped";
  }

  setSchedule(schedule) {
    this.schedule = normalizeDisplayPowerSchedule(schedule);
    return this.started
      ? this.requestReconciliation("schedule-change")
      : Promise.resolve();
  }

  requestReconciliation(reason, { force = false, retryAttempt = 0 } = {}) {
    if (!this.started) return Promise.resolve();

    const generation = ++this.generation;
    this.clearTimers();
    const run = () => {
      if (!this.started || generation !== this.generation) return;
      return this.reconcile({ reason, force, retryAttempt, generation });
    };

    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  async reconcile({ reason, force, retryAttempt, generation }) {
    const now = this.now();
    const evaluation = this.evaluator(this.schedule, new Date(now));
    const activeOverrides = this.overrideRegistry.getActive();
    const effectiveState = resolveEffectiveDisplayState(
      evaluation.baselineDesiredState,
      activeOverrides
    );

    this.diagnostics.baselineDesiredState = evaluation.baselineDesiredState;
    this.diagnostics.effectiveDesiredState = effectiveState;
    this.diagnostics.activeOverrideCount = activeOverrides.length;
    this.diagnostics.nextBoundary = evaluation.nextBoundary;
    this.diagnostics.retryAt = null;
    this.scheduleNextBoundary(evaluation.nextBoundary, generation);

    if (!force && effectiveState === this.lastSuccessfullyAppliedState) {
      this.diagnostics.lastError = null;
      return;
    }

    this.diagnostics.lastAttemptAt = new Date(now).toISOString();

    try {
      await this.adapter.setDisplayPower(effectiveState, {
        reason,
        requestedAt: new Date(now).toISOString(),
        reconciliationId: generation
      });
      this.lastSuccessfullyAppliedState = effectiveState;
      this.diagnostics.lastSuccessfullyAppliedState = effectiveState;
      this.diagnostics.lastSuccessfulApplyAt = new Date(this.now()).toISOString();
      this.diagnostics.lastError = null;

      if (generation !== this.generation && this.started) {
        return;
      }
    } catch (error) {
      if (generation !== this.generation || !this.started) return;

      this.diagnostics.lastError = {
        name: error?.name || "Error",
        message: String(error?.message || "Display adapter failed.").slice(0, 240)
      };
      this.scheduleRetry(retryAttempt, generation);
    }
  }

  scheduleNextBoundary(nextBoundary, generation) {
    if (!nextBoundary) return;

    const delay = Math.max(
      0,
      Math.min(new Date(nextBoundary).getTime() - this.now(), MAX_TIMER_DELAY)
    );
    this.boundaryTimer = this.scheduleTimeout(() => {
      this.boundaryTimer = null;
      if (generation !== this.generation) return;
      this.requestReconciliation("schedule-boundary");
    }, delay);
  }

  scheduleRetry(retryAttempt, generation) {
    const delay = this.retryDelays[
      Math.min(retryAttempt, this.retryDelays.length - 1)
    ];

    if (!Number.isFinite(delay)) return;

    this.diagnostics.retryAt = new Date(this.now() + delay).toISOString();
    this.retryTimer = this.scheduleTimeout(() => {
      this.retryTimer = null;
      if (generation !== this.generation) return;
      this.requestReconciliation("adapter-retry", {
        retryAttempt: retryAttempt + 1
      });
    }, delay);
  }

  clearTimers() {
    if (this.boundaryTimer !== null) {
      this.cancelTimeout(this.boundaryTimer);
      this.boundaryTimer = null;
    }
    if (this.retryTimer !== null) {
      this.cancelTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  getDiagnostics() {
    let capabilities = {};

    try {
      capabilities = this.adapter.getCapabilities?.() || {};
    } catch {}

    return {
      ...this.diagnostics,
      adapterCapabilities: {
        canSetPower: capabilities.canSetPower === true,
        canReadPower: capabilities.canReadPower === true,
        simulated: capabilities.simulated === true
      }
    };
  }
}

module.exports = { DisplayController };
