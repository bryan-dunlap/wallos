const HOME_ASSISTANT_ENTITY_ID_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/;

function normalizeHomeAssistantEntity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entityId = normalizeEntityId(value.entity_id);

  if (!entityId || typeof value.state !== "string") return null;

  const [domain, objectId] = entityId.split(".");
  const attributes = value.attributes &&
    typeof value.attributes === "object" &&
    !Array.isArray(value.attributes)
      ? value.attributes
      : {};
  const state = value.state;

  return {
    entityId,
    domain,
    state,
    displayName:
      normalizeOptionalText(attributes.friendly_name) ||
      humanizeObjectId(objectId),
    unit: normalizeOptionalText(attributes.unit_of_measurement),
    deviceClass: normalizeOptionalText(attributes.device_class),
    stateClass: normalizeOptionalText(attributes.state_class),
    icon: normalizeOptionalText(attributes.icon),
    availability: state === "unavailable"
      ? "unavailable"
      : state === "unknown"
        ? "unknown"
        : "available",
    lastChanged: normalizeTimestamp(value.last_changed),
    updatedAt: normalizeTimestamp(value.last_updated)
  };
}

function normalizeEntityId(value) {
  if (typeof value !== "string") return null;

  const entityId = value.trim();

  return HOME_ASSISTANT_ENTITY_ID_PATTERN.test(entityId)
    ? entityId
    : null;
}

function normalizeOptionalText(value) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function normalizeTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  const timestamp = value.trim();
  const parsed = Date.parse(timestamp);

  if (!Number.isFinite(parsed) || !/^\d{4}-\d{2}-\d{2}T/.test(timestamp)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function humanizeObjectId(objectId) {
  return objectId
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

module.exports = {
  HOME_ASSISTANT_ENTITY_ID_PATTERN,
  humanizeObjectId,
  normalizeEntityId,
  normalizeHomeAssistantEntity,
  normalizeOptionalText,
  normalizeTimestamp
};
