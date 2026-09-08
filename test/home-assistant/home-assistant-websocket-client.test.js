const assert = require("node:assert/strict");
const test = require("node:test");
const {
  acquireRegistries,
  HomeAssistantWebSocketError
} = require("../../backend/home-assistant/home-assistant-websocket-client");

const config = { baseUrl: "https://ha.example.test", accessToken: "never-expose-this-token" };

function fakeWebSocket({ auth = "ok", response, closeEarly = false } = {}) {
  return class FakeWebSocket {
    static instances = [];
    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.sent = [];
      this.closed = false;
      FakeWebSocket.instances.push(this);
      queueMicrotask(() => this.emit("message", { data: JSON.stringify({ type: "auth_required" }) }));
    }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    emit(type, event = {}) { for (const handler of this.listeners[type] || []) handler(event); }
    send(text) {
      const message = JSON.parse(text);
      this.sent.push(message);
      if (message.type === "auth") {
        queueMicrotask(() => this.emit("message", { data: JSON.stringify({ type: auth === "ok" ? "auth_ok" : "auth_invalid" }) }));
      } else if (closeEarly) {
        queueMicrotask(() => this.emit("close"));
      } else {
        const result = response?.(message) ?? [];
        const delay = message.id === 1 ? 3 : message.id === 2 ? 2 : 1;
        setTimeout(() => this.emit("message", { data: typeof result === "string" ? result : JSON.stringify({ id: message.id, type: "result", success: true, result }) }), delay);
      }
    }
    close() { this.closed = true; }
  };
}

test("authenticates, correlates registry commands, sanitizes, and always closes", async () => {
  const WebSocketImpl = fakeWebSocket({ response: ({ type }) => ({
    "config/entity_registry/list": [{ entity_id: "sensor.safe", device_id: "dev1", area_id: null, name: "Safe", original_name: "Original", platform: "demo", entity_category: "diagnostic", unique_id: "private", config_entry_id: "private" }],
    "config/device_registry/list": [{ id: "dev1", area_id: "room", name: "Device", name_by_user: "My Device", manufacturer: "Maker", model: "Model", connections: [["mac", "secret"]], identifiers: [["x", "secret"]] }],
    "config/area_registry/list": [{ area_id: "room", name: "Living Room", picture: "private" }]
  })[type] });
  const result = await acquireRegistries(config, { WebSocketImpl });
  const socket = WebSocketImpl.instances[0];

  assert.equal(socket.url, "wss://ha.example.test/api/websocket");
  assert.equal(socket.closed, true);
  assert.deepEqual(socket.sent.slice(1).map(item => item.type).sort(), [
    "config/area_registry/list", "config/device_registry/list", "config/entity_registry/list"
  ]);
  assert.equal(socket.sent.some(item => item.type?.startsWith("subscribe")), false);
  assert.deepEqual(result.entities[0], {
    entityId: "sensor.safe", deviceId: "dev1", areaId: null, name: "Safe",
    originalName: "Original", platform: "demo", entityCategory: "diagnostic",
    hidden: false, disabled: false
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /never-expose|unique_id|config_entry|connections|identifiers|secret/);
});

test("maps auth failure and premature close without leaking credentials", async () => {
  for (const [WebSocketImpl, code] of [
    [fakeWebSocket({ auth: "invalid" }), "unauthorized"],
    [fakeWebSocket({ closeEarly: true }), "premature_close"]
  ]) {
    await assert.rejects(
      acquireRegistries(config, { WebSocketImpl }),
      error => error instanceof HomeAssistantWebSocketError && error.code === code && !error.message.includes(config.accessToken)
    );
    assert.equal(WebSocketImpl.instances[0].closed, true);
  }
});

test("redacts hardware-address device names while retaining authoritative model", async () => {
  const WebSocketImpl = fakeWebSocket({ response: ({ type }) => ({
    "config/entity_registry/list": [],
    "config/device_registry/list": [{ id: "dev1", name: "aa:bb:cc:dd:ee:ff", manufacturer: "Maker", model: "Bridge" }],
    "config/area_registry/list": []
  })[type] });
  const result = await acquireRegistries(config, { WebSocketImpl });
  assert.equal(result.devices[0].name, null);
  assert.equal(result.devices[0].model, "Bridge");
  assert.doesNotMatch(JSON.stringify(result), /aa:bb:cc/);
});

test("rejects malformed and oversized messages and times out", async () => {
  await assert.rejects(acquireRegistries(config, {
    WebSocketImpl: fakeWebSocket({ response: () => "{" })
  }), error => error.code === "unexpected_response");
  await assert.rejects(acquireRegistries(config, {
    WebSocketImpl: fakeWebSocket({ response: () => ["oversized"] }), maxMessageBytes: 20
  }), error => error.code === "response_too_large");

  class MalformedResultSocket extends (fakeWebSocket()) {
    send(text) {
      const message = JSON.parse(text);
      this.sent.push(message);
      if (message.type === "auth") {
        queueMicrotask(() => this.emit("message", { data: JSON.stringify({ type: "auth_ok" }) }));
      } else {
        queueMicrotask(() => this.emit("message", { data: JSON.stringify({ id: message.id, type: "result", success: true, result: {} }) }));
      }
    }
  }
  await assert.rejects(acquireRegistries(config, { WebSocketImpl: MalformedResultSocket }), error => error.code === "unexpected_response");

  class ErrorSocket {
    constructor() { this.listeners = {}; queueMicrotask(() => this.emit("error")); }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    emit(type) { for (const handler of this.listeners[type] || []) handler({}); }
    close() { this.closed = true; }
  }
  await assert.rejects(acquireRegistries(config, { WebSocketImpl: ErrorSocket }), error => error.code === "unavailable");

  class SilentSocket {
    addEventListener() {}
    close() { this.closed = true; }
  }
  await assert.rejects(acquireRegistries(config, { WebSocketImpl: SilentSocket, timeoutMs: 5 }), error => error.code === "timeout");
});
