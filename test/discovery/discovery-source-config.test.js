const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeDiscoverySources,
  createPublicDiscoveryConfig
} = require("../../backend/discovery/discovery-source-config");

test("missing Discovery configuration receives the default Reddit source", () => {
  const sources = normalizeDiscoverySources();

  assert.equal(sources.length, 1);
  assert.equal(sources[0].type, "reddit");
  assert.equal(sources[0].name, "Reddit Mix");
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

  assert.equal(sources[1].config.url, "https://example.com/feed.xml?token=private");
  assert.deepEqual(publicConfig.sources[1], {
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

  assert.equal(sources.length, 1);
  assert.equal(sources[0].type, "reddit");
});
