const {
  normalizeEntityId
} = require("./home-assistant-entity-normalizer");

const MAX_HOME_ASSISTANT_SELECTED_ENTITIES = 32;
const MAX_HOME_ASSISTANT_DISPLAY_NAME_LENGTH = 80;

const DEFAULT_HOME_ASSISTANT_CONFIG = Object.freeze({
  enabled: false,
  baseUrl: "",
  accessToken: "",
  entities: Object.freeze([]),
  entityAliases: Object.freeze({}),
  widget: Object.freeze({ enabled: false })
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
  const entityAliases = normalizeHomeAssistantEntityAliases(
    config?.entityAliases,
    entities
  );
  const widget = {
    enabled: typeof config?.widget?.enabled === "boolean"
      ? config.widget.enabled
      : DEFAULT_HOME_ASSISTANT_CONFIG.widget.enabled
  };

  return {
    enabled,
    baseUrl: baseUrl || "",
    accessToken,
    entities,
    entityAliases,
    widget
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

function normalizeHomeAssistantEntityAliases(
  value,
  selectedEntityIds,
  { strict = false } = {}
) {
  if (typeof value === "undefined") return {};

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (strict) {
      throw new Error("Home Assistant entity aliases must be an object.");
    }
    return {};
  }

  const aliases = {};
  const selected = new Set(selectedEntityIds);

  for (const [candidateId, candidateAlias] of Object.entries(value)) {
    const entityId = normalizeEntityId(candidateId);

    if (!entityId || !selected.has(entityId)) continue;

    if (typeof candidateAlias !== "string") {
      if (strict) {
        throw new Error("Home Assistant Display Name must be a string.");
      }
      continue;
    }

    const alias = candidateAlias.trim();
    if (!alias) continue;

    if (alias.length > MAX_HOME_ASSISTANT_DISPLAY_NAME_LENGTH) {
      if (strict) {
        throw new Error(
          `Home Assistant Display Name must be at most ${MAX_HOME_ASSISTANT_DISPLAY_NAME_LENGTH} characters.`
        );
      }
      continue;
    }

    aliases[entityId] = alias;
  }

  return aliases;
}

function normalizeHomeAssistantSelection(value, { strict = false } = {}) {
  if (typeof value === "undefined") {
    return { entities: [], entityAliases: {} };
  }

  if (!Array.isArray(value)) {
    if (strict) throw new Error("Home Assistant entities must be an array.");
    return { entities: [], entityAliases: {} };
  }

  const entityCandidates = [];
  const aliasCandidates = {};

  value.forEach((candidate) => {
    if (typeof candidate === "string") {
      entityCandidates.push(candidate);
      return;
    }

    if (!candidate || typeof candidate !== "object") {
      entityCandidates.push(candidate);
      return;
    }

    entityCandidates.push(candidate.entityId);
    if (Object.hasOwn(candidate, "displayName")) {
      aliasCandidates[candidate.entityId] = candidate.displayName;
    }
  });

  const entities = normalizeHomeAssistantEntities(
    entityCandidates,
    { strict }
  );
  const entityAliases = normalizeHomeAssistantEntityAliases(
    aliasCandidates,
    entities,
    { strict }
  );

  return { entities, entityAliases };
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
    entities: [...normalized.entities],
    widget: { ...normalized.widget }
  };
}

module.exports = {
  DEFAULT_HOME_ASSISTANT_CONFIG,
  MAX_HOME_ASSISTANT_DISPLAY_NAME_LENGTH,
  MAX_HOME_ASSISTANT_SELECTED_ENTITIES,
  createPublicHomeAssistantConfig,
  isHomeAssistantConfigured,
  normalizeHomeAssistantAccessToken,
  normalizeHomeAssistantBaseUrl,
  normalizeHomeAssistantConfig,
  normalizeHomeAssistantEntityAliases,
  normalizeHomeAssistantSelection,
  normalizeHomeAssistantEntities
};
