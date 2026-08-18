const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DiscoveryAggregator
} = require("../../backend/discovery/discovery-aggregator");

test("healthy sources survive an independent source failure", async () => {
  const adapters = new Map([
    ["healthy", {
      getItems: async () => [{
        id: "healthy:1",
        type: "text",
        source: "healthy",
        eyebrow: "Healthy",
        title: "Available item"
      }]
    }],
    ["failed", {
      getItems: async () => {
        throw new Error("unavailable");
      }
    }]
  ]);
  const aggregator = new DiscoveryAggregator({
    get: (type) => adapters.get(type) || null
  });
  const items = await aggregator.getItems([
    { type: "failed", enabled: true },
    { type: "healthy", enabled: true }
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Available item");
});

test("duplicate normalized items collapse into one collection entry", async () => {
  const duplicate = {
    id: "one",
    type: "text",
    source: "rss",
    eyebrow: "News",
    title: "Shared story"
  };
  const aggregator = new DiscoveryAggregator({
    get: () => ({
      getItems: async () => [
        duplicate,
        { ...duplicate, id: "two" }
      ]
    })
  });
  const items = await aggregator.getItems([
    { type: "rss", enabled: true }
  ]);

  assert.equal(items.length, 1);
});
