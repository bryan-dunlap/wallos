const {
  normalizeHomeAssistantConfig
} = require("./home-assistant-config");
const DefaultWebSocket = require("ws");
const {
  normalizeEntityId,
  normalizeOptionalText
} = require("./home-assistant-entity-normalizer");

const HOME_ASSISTANT_WEBSOCKET_TIMEOUT_MS = 15 * 1000;
const MAX_HOME_ASSISTANT_WEBSOCKET_MESSAGE_BYTES = 8 * 1024 * 1024;
const MAX_HOME_ASSISTANT_WEBSOCKET_TOTAL_BYTES = 24 * 1024 * 1024;
const REGISTRY_COMMANDS = Object.freeze([
  "config/entity_registry/list",
  "config/device_registry/list",
  "config/area_registry/list"
]);

class HomeAssistantWebSocketError extends Error {
  constructor(code = "unavailable") {
    super("Home Assistant registry request failed.");
    this.name = "HomeAssistantWebSocketError";
    this.code = code;
  }
}

async function acquireRegistries(
  { baseUrl, accessToken } = {},
  {
    WebSocketImpl = DefaultWebSocket,
    timeoutMs = HOME_ASSISTANT_WEBSOCKET_TIMEOUT_MS,
    maxMessageBytes = MAX_HOME_ASSISTANT_WEBSOCKET_MESSAGE_BYTES,
    maxTotalBytes = MAX_HOME_ASSISTANT_WEBSOCKET_TOTAL_BYTES
  } = {}
) {
  const config = normalizeHomeAssistantConfig({
    enabled: true,
    baseUrl,
    accessToken
  });
  if (!config.baseUrl || !config.accessToken) {
    throw new HomeAssistantWebSocketError("invalid_configuration");
  }
  if (typeof WebSocketImpl !== "function") {
    throw new HomeAssistantWebSocketError("unavailable");
  }

  const endpoint = new URL(`${config.baseUrl}/api/websocket`);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";

  return new Promise((resolve, reject) => {
    let socket;
    let settled = false;
    let authenticated = false;
    let totalBytes = 0;
    let nextId = 1;
    const pending = new Map();
    const results = new Map();
    const timer = setTimeout(() => finishError("timeout"), timeoutMs);

    function closeSocket() {
      try { socket?.close(); } catch {}
    }

    function finishError(code) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeSocket();
      reject(new HomeAssistantWebSocketError(code));
    }

    function finishSuccess() {
      if (settled || results.size !== REGISTRY_COMMANDS.length) return;
      let registries;
      try {
        registries = sanitizeRegistries({
          entities: results.get(REGISTRY_COMMANDS[0]),
          devices: results.get(REGISTRY_COMMANDS[1]),
          areas: results.get(REGISTRY_COMMANDS[2])
        });
      } catch {
        finishError("unexpected_response");
        return;
      }
      settled = true;
      clearTimeout(timer);
      closeSocket();
      resolve(registries);
    }

    function send(message) {
      try { socket.send(JSON.stringify(message)); }
      catch { finishError("unavailable"); }
    }

    function handleMessage(event) {
      if (settled) return;
      const text = typeof event.data === "string" ? event.data : null;
      if (text === null) return finishError("unexpected_response");
      const bytes = Buffer.byteLength(text, "utf8");
      totalBytes += bytes;
      if (bytes > maxMessageBytes || totalBytes > maxTotalBytes) {
        return finishError("response_too_large");
      }
      let message;
      try { message = JSON.parse(text); }
      catch { return finishError("unexpected_response"); }
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        return finishError("unexpected_response");
      }
      if (!authenticated) {
        if (message.type === "auth_required") {
          send({ type: "auth", access_token: config.accessToken });
          return;
        }
        if (message.type === "auth_invalid") return finishError("unauthorized");
        if (message.type !== "auth_ok") return finishError("unexpected_response");
        authenticated = true;
        for (const type of REGISTRY_COMMANDS) {
          const id = nextId++;
          pending.set(id, type);
          send({ id, type });
        }
        return;
      }
      if (message.type !== "result" || !Number.isInteger(message.id)) {
        return finishError("unexpected_response");
      }
      const command = pending.get(message.id);
      if (!command || message.success !== true || !Array.isArray(message.result)) {
        return finishError("unexpected_response");
      }
      pending.delete(message.id);
      results.set(command, message.result);
      finishSuccess();
    }

    try {
      socket = new WebSocketImpl(endpoint.href, {
        handshakeTimeout: timeoutMs,
        maxPayload: maxMessageBytes
      });
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("error", () => finishError("unavailable"));
      socket.addEventListener("close", () => {
        if (!settled) finishError("premature_close");
      });
    } catch {
      finishError("unavailable");
    }
  });
}

function sanitizeRegistries(value) {
  return {
    entities: value.entities.map(sanitizeEntityRegistryEntry).filter(Boolean),
    devices: value.devices.map(sanitizeDeviceRegistryEntry).filter(Boolean),
    areas: value.areas.map(sanitizeAreaRegistryEntry).filter(Boolean)
  };
}

function sanitizeEntityRegistryEntry(value) {
  if (!isRecord(value)) return null;
  const entityId = normalizeEntityId(value.entity_id);
  if (!entityId) return null;
  return {
    entityId,
    deviceId: normalizeInternalId(value.device_id),
    areaId: normalizeInternalId(value.area_id),
    name: normalizeOptionalText(value.name),
    originalName: normalizeOptionalText(value.original_name),
    platform: normalizeOptionalText(value.platform),
    entityCategory: ["diagnostic", "config"].includes(value.entity_category)
      ? value.entity_category : null,
    hidden: value.hidden_by != null,
    disabled: value.disabled_by != null
  };
}

function sanitizeDeviceRegistryEntry(value) {
  if (!isRecord(value)) return null;
  const id = normalizeInternalId(value.id);
  if (!id) return null;
  const preferredName = normalizeOptionalText(value.name_by_user) || normalizeOptionalText(value.name);
  return {
    id,
    areaId: normalizeInternalId(value.area_id),
    name: isHardwareAddressLike(preferredName) ? null : preferredName,
    manufacturer: normalizeOptionalText(value.manufacturer),
    model: normalizeOptionalText(value.model)
  };
}

function isHardwareAddressLike(value) {
  return typeof value === "string" && (
    /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(value.trim()) ||
    /^[0-9a-f]{12}$/i.test(value.trim())
  );
}

function sanitizeAreaRegistryEntry(value) {
  if (!isRecord(value)) return null;
  const id = normalizeInternalId(value.area_id);
  const name = normalizeOptionalText(value.name);
  return id && name ? { id, name } : null;
}

function normalizeInternalId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
    ? value : null;
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  acquireRegistries,
  HOME_ASSISTANT_WEBSOCKET_TIMEOUT_MS,
  HomeAssistantWebSocketError,
  MAX_HOME_ASSISTANT_WEBSOCKET_MESSAGE_BYTES,
  MAX_HOME_ASSISTANT_WEBSOCKET_TOTAL_BYTES,
  REGISTRY_COMMANDS,
  sanitizeRegistries
};
