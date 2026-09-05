class NoopDisplayPowerAdapter {
  getCapabilities() {
    return {
      canSetPower: false,
      canReadPower: false,
      simulated: false
    };
  }

  async setDisplayPower() {}
}

module.exports = { NoopDisplayPowerAdapter };
