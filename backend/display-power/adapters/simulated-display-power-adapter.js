class SimulatedDisplayPowerAdapter {
  constructor({ latencyMs = 0, fail = null, setTimeout: delay = setTimeout } = {}) {
    this.latencyMs = latencyMs;
    this.fail = fail;
    this.delay = delay;
    this.calls = [];
    this.lastState = null;
  }

  getCapabilities() {
    return {
      canSetPower: true,
      canReadPower: true,
      simulated: true
    };
  }

  async getDisplayPower() {
    return this.lastState || "unknown";
  }

  async setDisplayPower(state, context = {}) {
    const call = {
      state,
      context: { ...context },
      status: "pending"
    };
    this.calls.push(call);

    if (this.latencyMs > 0) {
      await new Promise((resolve) => this.delay(resolve, this.latencyMs));
    }

    const failure = typeof this.fail === "function"
      ? this.fail(call, this.calls.length)
      : this.fail;

    if (failure) {
      call.status = "failed";
      throw failure instanceof Error
        ? failure
        : new Error("Simulated display adapter failure.");
    }

    this.lastState = state;
    call.status = "applied";
  }

  clear() {
    this.calls.length = 0;
  }
}

module.exports = { SimulatedDisplayPowerAdapter };
