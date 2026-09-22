const {
  isHomeAssistantConfigured,
  normalizeHomeAssistantConfig
} = require("./home-assistant-config");
const {
  humanizeObjectId,
  normalizeEntityId
} = require("./home-assistant-entity-normalizer");

const HOME_ASSISTANT_SELECTED_STATE_SCHEMA_VERSION = 1;

async function resolveHomeAssistantSelectedState(
  config,
  { stateCache, forceRefresh = false } = {}
) {
  const normalized = normalizeHomeAssistantConfig(config);
  const selectedIds = normalized.entities;

  if (!normalized.enabled) {
    return createSourceSnapshot("disabled", selectedIds.length);
  }

  if (!isHomeAssistantConfigured(normalized)) {
    return createSourceSnapshot("unconfigured", selectedIds.length);
  }

  if (selectedIds.length === 0) {
    return createSourceSnapshot("empty", 0);
  }

  if (!stateCache || typeof stateCache.getSnapshot !== "function") {
    return createSourceSnapshot("unavailable", selectedIds.length);
  }

  let snapshot;

  try {
    snapshot = await stateCache.getSnapshot(normalized, { forceRefresh });
  } catch {
    return createSourceSnapshot("unavailable", selectedIds.length);
  }

  if (snapshot?.status !== "available") {
    return createSourceSnapshot("unavailable", selectedIds.length);
  }

  const acquiredEntities = Array.isArray(snapshot.allEntities)
    ? snapshot.allEntities
    : snapshot.entities;
  const entityById = new Map(
    (Array.isArray(acquiredEntities) ? acquiredEntities : [])
      .filter((entity) => normalizeEntityId(entity?.entityId))
      .map((entity) => [entity.entityId, entity])
  );
  const entities = selectedIds.map((entityId) => {
    const entity = entityById.get(entityId);
    const mosaicDisplayName = normalized.entityAliases[entityId] || null;

    return entity
      ? createResolvedEntity(entity, mosaicDisplayName)
      : createMissingEntity(entityId, mosaicDisplayName);
  });

  return {
    schemaVersion: HOME_ASSISTANT_SELECTED_STATE_SCHEMA_VERSION,
    status: "available",
    stale: snapshot.stale === true,
    updatedAt: typeof snapshot.updatedAt === "string"
      ? snapshot.updatedAt
      : null,
    selectedCount: selectedIds.length,
    entities
  };
}

function createSourceSnapshot(status, selectedCount) {
  return {
    schemaVersion: HOME_ASSISTANT_SELECTED_STATE_SCHEMA_VERSION,
    status,
    stale: false,
    updatedAt: null,
    selectedCount,
    entities: []
  };
}

function createResolvedEntity(entity, mosaicDisplayName = null) {
  return {
    entityId: entity.entityId,
    domain: entity.domain,
    displayName: entity.displayName,
    mosaicDisplayName,
    state: entity.state,
    unit: entity.unit ?? null,
    deviceClass: entity.deviceClass ?? null,
    stateClass: entity.stateClass ?? null,
    icon: entity.icon ?? null,
    availability: entity.availability,
    lastChanged: entity.lastChanged ?? null,
    updatedAt: entity.updatedAt ?? null
  };
}

function createMissingEntity(entityId, mosaicDisplayName = null) {
  const [domain, objectId] = entityId.split(".");

  return {
    entityId,
    domain,
    displayName: humanizeObjectId(objectId),
    mosaicDisplayName,
    state: null,
    unit: null,
    deviceClass: null,
    stateClass: null,
    icon: null,
    availability: "missing",
    lastChanged: null,
    updatedAt: null
  };
}

module.exports = {
  HOME_ASSISTANT_SELECTED_STATE_SCHEMA_VERSION,
  createMissingEntity,
  resolveHomeAssistantSelectedState
};
