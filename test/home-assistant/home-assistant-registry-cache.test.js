const assert = require("node:assert/strict");
const test = require("node:test");
const { HomeAssistantRegistryCache } = require("../../backend/home-assistant/home-assistant-registry-cache");

const config = { baseUrl: "https://ha.example.test", accessToken: "token" };
const registries = suffix => ({ entities: [{ entityId: `sensor.${suffix}` }], devices: [], areas: [] });

test("registry cache is fresh, force-refreshable, and config-sensitive", async () => {
  let calls = 0;
  const cache = new HomeAssistantRegistryCache({ acquire: async () => registries(++calls) });
  await cache.getSnapshot(config);
  await cache.getSnapshot(config);
  await cache.getSnapshot(config, { forceRefresh: true });
  await cache.getSnapshot({ ...config, accessToken: "changed" });
  assert.equal(calls, 3);
});

test("registry cache deduplicates refresh and preserves bounded stale good data", async () => {
  let now = 0;
  let complete;
  let calls = 0;
  let fail = false;
  const cache = new HomeAssistantRegistryCache({
    now: () => now,
    acquire: async () => {
      calls += 1;
      if (fail) throw new Error("private failure");
      if (calls === 1) return new Promise(resolve => { complete = resolve; });
      return registries("next");
    }
  });
  const one = cache.getSnapshot(config);
  const two = cache.getSnapshot(config);
  complete(registries("good"));
  await Promise.all([one, two]);
  assert.equal(calls, 1);
  fail = true;
  now = 300001;
  const stale = await cache.getSnapshot(config);
  assert.equal(stale.stale, true);
  assert.equal(stale.registries.entities[0].entityId, "sensor.good");
  now = 86400001;
  assert.equal((await cache.getSnapshot(config)).status, "unavailable");
});

test("malformed refresh never overwrites last-known-good", async () => {
  let now = 0;
  let value = registries("good");
  const cache = new HomeAssistantRegistryCache({ now: () => now, acquire: async () => value });
  await cache.getSnapshot(config);
  value = { raw: true };
  now = 300001;
  const stale = await cache.getSnapshot(config);
  assert.equal(stale.registries.entities[0].entityId, "sensor.good");
  assert.equal(stale.stale, true);
});
