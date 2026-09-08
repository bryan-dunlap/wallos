const assert = require("node:assert/strict");
const test = require("node:test");
const {
  HomeAssistantStateCache,
  MAX_HOME_ASSISTANT_ENTITIES
} = require(
  "../../backend/home-assistant/home-assistant-state-cache"
);

const config = {
  baseUrl: "https://ha.example.test",
  accessToken: "private-cache-token"
};

function state(entityId, value = "on") {
  return { entity_id: entityId, state: value, attributes: {} };
}

test("fresh snapshots avoid acquisition and expiry refreshes", async () => {
  let now = 1000;
  let calls = 0;
  const cache = new HomeAssistantStateCache({
    now: () => now,
    acquire: async () => {
      calls += 1;
      return [state(`sensor.reading_${calls}`)];
    }
  });

  const first = await cache.getSnapshot(config);
  now += 29999;
  const fresh = await cache.getSnapshot(config);
  now += 1;
  const refreshed = await cache.getSnapshot(config);

  assert.equal(calls, 2);
  assert.equal(first.entities[0].entityId, "sensor.reading_1");
  assert.equal(fresh.entities[0].entityId, "sensor.reading_1");
  assert.equal(refreshed.entities[0].entityId, "sensor.reading_2");
});

test("concurrent refreshes share one acquisition", async () => {
  let resolve;
  let calls = 0;
  const cache = new HomeAssistantStateCache({
    acquire: async () => {
      calls += 1;
      return new Promise((done) => { resolve = done; });
    }
  });
  const first = cache.getSnapshot(config);
  const second = cache.getSnapshot(config);

  resolve([state("switch.shared")]);
  const [left, right] = await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.deepEqual(left, right);
});

test("serves last-known-good stale only within the stale horizon", async () => {
  let now = 0;
  let fail = false;
  const cache = new HomeAssistantStateCache({
    now: () => now,
    acquire: async () => {
      if (fail) throw new Error("private upstream failure");
      return [state("light.safe")];
    }
  });

  await cache.getSnapshot(config);
  fail = true;
  now = 30000;
  const stale = await cache.getSnapshot(config);
  now = 900001;
  const unavailable = await cache.getSnapshot(config);

  assert.equal(stale.status, "available");
  assert.equal(stale.stale, true);
  assert.equal(unavailable.status, "unavailable");
  assert.deepEqual(unavailable.entities, []);
});

test("malformed refresh does not replace last-known-good data", async () => {
  let now = 0;
  let response = [state("sensor.valid")];
  const cache = new HomeAssistantStateCache({
    now: () => now,
    acquire: async () => response
  });

  await cache.getSnapshot(config);
  response = { raw: "not an array" };
  now = 30000;
  const stale = await cache.getSnapshot(config);

  assert.equal(stale.stale, true);
  assert.equal(stale.entities[0].entityId, "sensor.valid");
});

test("sorts deterministically and caps entities with exact totals", async () => {
  const raw = Array.from(
    { length: MAX_HOME_ASSISTANT_ENTITIES + 1 },
    (_, index) => state(`sensor.item_${String(index).padStart(4, "0")}`)
  ).reverse();
  const cache = new HomeAssistantStateCache({ acquire: async () => raw });
  const snapshot = await cache.getSnapshot(config);

  assert.equal(snapshot.entities.length, MAX_HOME_ASSISTANT_ENTITIES);
  assert.equal(snapshot.total, MAX_HOME_ASSISTANT_ENTITIES + 1);
  assert.equal(snapshot.truncated, true);
  assert.equal(snapshot.entities[0].entityId, "sensor.item_0000");
  assert.equal(snapshot.entities.at(-1).entityId, "sensor.item_1999");
  assert.equal("domainTotals" in snapshot, true);
  assert.equal(JSON.stringify(snapshot).includes("domainTotals"), false);
});

test("changing configuration invalidates cached state", async () => {
  let calls = 0;
  const cache = new HomeAssistantStateCache({
    acquire: async () => [state(`sensor.config_${++calls}`)]
  });

  await cache.getSnapshot(config);
  const changed = await cache.getSnapshot({
    ...config,
    accessToken: "replacement-token"
  });

  assert.equal(calls, 2);
  assert.equal(changed.entities[0].entityId, "sensor.config_2");
});
