const LEGACY_REDDIT_FEED_URL =
  "https://www.reddit.com/r/news+nottheonion+WeirdNews+OutOFTheLoop+onthisday/.rss?sort=hot";

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
    const url = canonicalizeRedditFeedUrl(
      configuredSource?.config?.url
    ) || normalizeFeedUrl(
      configuredSource?.config?.url
    ) || LEGACY_REDDIT_FEED_URL;

    return {
      id,
      name,
      type: "rss",
      enabled: configuredSource.enabled !== false,
      config: { url }
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

function canonicalizeRedditFeedUrl(value) {
  const input = normalizeString(value);

  if (!input) return null;

  const subredditMatch = input.match(/^(?:r\/)?([A-Za-z0-9_+]+)\/?$/i);

  if (subredditMatch) {
    return `https://www.reddit.com/r/${subredditMatch[1].toLowerCase()}/.rss`;
  }

  try {
    const inputUrl = new URL(input);
    const hostname = inputUrl.hostname.toLowerCase();

    if (
      !["http:", "https:"].includes(inputUrl.protocol) ||
      (hostname !== "reddit.com" && !hostname.endsWith(".reddit.com"))
    ) {
      return null;
    }

    const path = inputUrl.pathname
      .replace(/\/+$/, "")
      .replace(/\/\.rss$/i, "")
      .replace(
        /^\/r\/([^/]+)/i,
        (match, subreddit) => `/r/${subreddit.toLowerCase()}`
      );

    if (!path || path === "/") return null;

    inputUrl.protocol = "https:";
    inputUrl.hostname = "www.reddit.com";
    inputUrl.port = "";
    inputUrl.pathname = `${path}/.rss`;
    inputUrl.hash = "";

    return inputUrl.href;
  } catch {
    return null;
  }
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

function normalizeDiscoverySourceAddress(value) {
  return canonicalizeRedditFeedUrl(value) || normalizeFeedUrl(value);
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
  LEGACY_REDDIT_FEED_URL,
  canonicalizeRedditFeedUrl,
  normalizeDiscoverySources,
  normalizeDiscoverySourceAddress,
  normalizeFeedUrl,
  createPublicDiscoveryConfig
};
