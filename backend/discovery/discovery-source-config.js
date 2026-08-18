const DEFAULT_REDDIT_DISCOVERY_SOURCE = Object.freeze({
  id: "discovery-reddit-default",
  name: "Reddit Mix",
  type: "reddit",
  enabled: true,
  config: {}
});

function normalizeDiscoverySources(configuredSources) {
  const input = Array.isArray(configuredSources)
    ? configuredSources
    : [];
  const sources = [];
  const seenIds = new Set();

  for (const configuredSource of input) {
    const source = normalizeDiscoverySource(configuredSource);

    if (!source || seenIds.has(source.id)) continue;

    seenIds.add(source.id);
    sources.push(source);
  }

  if (!sources.some((source) => source.type === "reddit")) {
    sources.unshift(structuredClone(DEFAULT_REDDIT_DISCOVERY_SOURCE));
  }

  return sources;
}

function normalizeDiscoverySource(configuredSource) {
  const id = normalizeString(configuredSource?.id);
  const name = normalizeString(configuredSource?.name);
  const type = normalizeString(configuredSource?.type).toLowerCase();

  if (!id || !name || !["reddit", "rss"].includes(type)) {
    return null;
  }

  if (type === "reddit") {
    return {
      id,
      name,
      type,
      enabled: configuredSource.enabled !== false,
      config: {}
    };
  }

  const url = normalizeFeedUrl(configuredSource?.config?.url);

  if (!url) return null;

  return {
    id,
    name,
    type,
    enabled: configuredSource.enabled !== false,
    config: { url }
  };
}

function normalizeFeedUrl(value) {
  const configuredUrl = normalizeString(value);

  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);

    return ["https:", "http:"].includes(url.protocol)
      ? configuredUrl
      : null;
  } catch {
    return null;
  }
}

function createPublicDiscoveryConfig(discoveryConfig) {
  return {
    enabled: discoveryConfig.enabled,
    sources: discoveryConfig.sources.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.type,
      enabled: source.enabled
    }))
  };
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  DEFAULT_REDDIT_DISCOVERY_SOURCE,
  normalizeDiscoverySources,
  normalizeFeedUrl,
  createPublicDiscoveryConfig
};
