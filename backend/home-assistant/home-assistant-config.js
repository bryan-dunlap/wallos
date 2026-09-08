const {
  normalizeEntityId
} = require("./home-assistant-entity-normalizer");

const MAX_HOME_ASSISTANT_SELECTED_ENTITIES = 32;

const DEFAULT_HOME_ASSISTANT_CONFIG = Object.freeze({
  enabled: false,
  baseUrl: "",
  accessToken: "",
  entities: Object.freeze([])
});

function normalizeHomeAssistantConfig(config) {
  const enabled = typeof config?.enabled === "boolean"
    ? config.enabled
    : DEFAULT_HOME_ASSISTANT_CONFIG.enabled;
  const baseUrl = normalizeHomeAssistantBaseUrl(config?.baseUrl);
  const accessToken = normalizeHomeAssistantAccessToken(
    config?.accessToken
  );
  const entities = normalizeHomeAssistantEntities(config?.entities);

  return {
    enabled,
    baseUrl: baseUrl || "",
    accessToken,
    entities
  };
}

function normalizeHomeAssistantBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim());

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    url.pathname = url.pathname.replace(/\/+$/, "");

    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizeHomeAssistantAccessToken(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHomeAssistantEntities(value, { strict = false } = {}) {
  if (typeof value === "undefined") return [];

  if (!Array.isArray(value)) {
    if (strict) throw new Error("Home Assistant entities must be an array.");
    return [];
  }

  const entities = [];
  const seen = new Set();

  for (const candidate of value) {
    const entityId = normalizeEntityId(candidate);

    if (!entityId) {
      if (strict) throw new Error("Home Assistant entity ID is invalid.");
      continue;
    }

    if (seen.has(entityId)) continue;

    seen.add(entityId);
    entities.push(entityId);
  }

  if (entities.length > MAX_HOME_ASSISTANT_SELECTED_ENTITIES) {
    if (strict) {
      throw new Error(
        `Home Assistant supports at most ${MAX_HOME_ASSISTANT_SELECTED_ENTITIES} selected entities.`
      );
    }

    return entities.slice(0, MAX_HOME_ASSISTANT_SELECTED_ENTITIES);
  }

  return entities;
}

function isHomeAssistantConfigured(config) {
  const normalized = normalizeHomeAssistantConfig(config);

  return Boolean(normalized.baseUrl && normalized.accessToken);
}

function createPublicHomeAssistantConfig(config) {
  const normalized = normalizeHomeAssistantConfig(config);

  return {
    enabled: normalized.enabled,
    baseUrl: normalized.baseUrl,
    configured: isHomeAssistantConfigured(normalized),
    entities: [...normalized.entities]
  };
}

module.exports = {
  DEFAULT_HOME_ASSISTANT_CONFIG,
  MAX_HOME_ASSISTANT_SELECTED_ENTITIES,
  createPublicHomeAssistantConfig,
  isHomeAssistantConfigured,
  normalizeHomeAssistantAccessToken,
  normalizeHomeAssistantBaseUrl,
  normalizeHomeAssistantConfig,
  normalizeHomeAssistantEntities
};
