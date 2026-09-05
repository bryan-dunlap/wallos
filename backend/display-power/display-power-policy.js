function resolveEffectiveDisplayState(baselineDesiredState, activeOverrides = []) {
  if (!['on', 'off'].includes(baselineDesiredState)) {
    throw new Error("Baseline display state must be on or off.");
  }

  return baselineDesiredState === "on" || activeOverrides.length > 0
    ? "on"
    : "off";
}

module.exports = { resolveEffectiveDisplayState };
