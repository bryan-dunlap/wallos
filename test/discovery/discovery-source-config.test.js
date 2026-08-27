const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LEGACY_REDDIT_FEED_URL,
  canonicalizeRedditFeedUrl,
  normalizeDiscoverySourceAddress,
  normalizeDiscoverySources,
  createPublicDiscoveryConfig
} = require("../../backend/discovery/discovery-source-config");

test("missing and empty Discovery configuration remains empty", () => {
  const sources = normalizeDiscoverySources();

  assert.deepEqual(sources, []);
  assert.deepEqual(normalizeDiscoverySources([]), []);
});

test("RSS configuration is retained internally and redacted publicly", () => {
  const sources = normalizeDiscoverySources([{
    id: "news",
    name: "Technology News",
    type: "rss",
    enabled: false,
    config: { url: "https://example.com/feed.xml?token=private" }
  }]);
  const publicConfig = createPublicDiscoveryConfig({
    enabled: true,
    sources
  });

  assert.equal(sources[0].config.url, "https://example.com/feed.xml?token=private");
  assert.deepEqual(publicConfig.sources[0], {
    id: "news",
    name: "Technology News",
    type: "rss",
    enabled: false
  });
  assert.equal(JSON.stringify(publicConfig).includes("token=private"), false);
});

test("invalid source protocols are rejected", () => {
  const sources = normalizeDiscoverySources([{
    id: "bad",
    name: "Bad Feed",
    type: "rss",
    config: { url: "file:///private/feed.xml" }
  }]);

  assert.deepEqual(sources, []);
});

test("RSS configuration persists and reloads unchanged", () => {
  const configuredSource = {
    id: "nasa",
    name: "NASA",
    type: "rss",
    enabled: true,
    config: { url: "https://www.nasa.gov/feed/" }
  };

  assert.deepEqual(
    normalizeDiscoverySources(
      normalizeDiscoverySources([configuredSource])
    ),
    [configuredSource]
  );
});

test("Reddit inputs canonicalize to the same RSS address", () => {
  assert.equal(
    canonicalizeRedditFeedUrl("r/baseball"),
    "https://www.reddit.com/r/baseball/.rss"
  );
  assert.equal(
    canonicalizeRedditFeedUrl("https://reddit.com/r/BaseBall/"),
    "https://www.reddit.com/r/baseball/.rss"
  );
  assert.equal(
    canonicalizeRedditFeedUrl("https://example.com/r/baseball/"),
    null
  );
});

test("Discovery addresses auto-detect feeds, Reddit, and invalid input", () => {
  const feedUrl = "https://example.com/atom.xml";

  assert.equal(normalizeDiscoverySourceAddress(feedUrl), feedUrl);
  assert.equal(
    normalizeDiscoverySourceAddress("r/baseball"),
    "https://www.reddit.com/r/baseball/.rss"
  );
  assert.equal(
    normalizeDiscoverySourceAddress("https://reddit.com/r/BaseBall/"),
    "https://www.reddit.com/r/baseball/.rss"
  );
  assert.equal(normalizeDiscoverySourceAddress("not a feed address"), null);
  assert.equal(normalizeDiscoverySourceAddress("file:///tmp/feed.xml"), null);
});

test("multi-subreddit edits canonicalize through the shared address path", () => {
  assert.equal(
    normalizeDiscoverySourceAddress(
      "https://www.reddit.com/r/news+nottheonion+WeirdNews+baseball/.rss"
    ),
    "https://www.reddit.com/r/news+nottheonion+weirdnews+baseball/.rss"
  );
});

test("legacy Reddit configuration migrates to a removable generic RSS source", () => {
  const [source] = normalizeDiscoverySources([{
    id: "discovery-reddit-default",
    name: "Reddit Mix",
    type: "reddit",
    enabled: false,
    config: {}
  }]);

  assert.deepEqual(source, {
    id: "discovery-reddit-default",
    name: "Reddit Mix",
    type: "rss",
    enabled: false,
    config: { url: LEGACY_REDDIT_FEED_URL }
  });
  assert.deepEqual(normalizeDiscoverySources([]), []);
});
