function normalizeCalendarSources(configuredSources) {
  if (!Array.isArray(configuredSources)) return [];

  const seenIds = new Set();

  return configuredSources.reduce((sources, configuredSource) => {
    const id = typeof configuredSource?.id === "string"
      ? configuredSource.id.trim()
      : "";
    const name = typeof configuredSource?.name === "string"
      ? configuredSource.name.trim()
      : "";
    const url = normalizeCalendarUrl(configuredSource?.url);

    if (!id || !name || !url || seenIds.has(id)) return sources;

    seenIds.add(id);
    sources.push({
      id,
      name,
      enabled: configuredSource.enabled !== false,
      url
    });

    return sources;
  }, []);
}

function normalizeCalendarUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:"
      ? value.trim()
      : null;
  } catch (error) {
    return null;
  }
}

function createPublicCalendarConfig(calendarConfig) {
  return {
    enabled: calendarConfig.enabled,
    provider: calendarConfig.provider,
    sources: calendarConfig.sources.map((source) => ({
      id: source.id,
      name: source.name,
      enabled: source.enabled
    }))
  };
}

module.exports = {
  normalizeCalendarSources,
  createPublicCalendarConfig
};
