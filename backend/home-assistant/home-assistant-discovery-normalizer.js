const { normalizeEntityId, normalizeOptionalText } = require("./home-assistant-entity-normalizer");

function createDiscoveryEntities(stateEntities, registries) {
  if (!Array.isArray(stateEntities)) return [];
  const entityById = new Map((registries?.entities || [])
    .filter(entry => entry && normalizeEntityId(entry.entityId) && !entry.disabled)
    .map(entry => [entry.entityId, entry]));
  const deviceById = new Map((registries?.devices || [])
    .filter(entry => entry?.id)
    .map(entry => [entry.id, entry]));
  const areaById = new Map((registries?.areas || [])
    .filter(entry => entry?.id && normalizeOptionalText(entry.name))
    .map(entry => [entry.id, entry]));
  const deviceGroupById = new Map();
  let nextDeviceGroup = 1;

  return stateEntities.map(state => {
    const registry = entityById.get(state.entityId) || null;
    const device = registry?.deviceId ? deviceById.get(registry.deviceId) || null : null;
    const areaId = registry?.areaId || device?.areaId || null;
    const area = areaId ? areaById.get(areaId) || null : null;
    return {
      ...pickStateFields(state),
      displayName: registry?.name || registry?.originalName || state.displayName,
      device: device ? {
        groupKey: getDeviceGroupKey(device.id),
        name: device.name || device.model || device.manufacturer || "Unnamed device",
        manufacturer: device.manufacturer || null,
        model: device.model || null
      } : null,
      area: area ? { name: area.name } : null,
      platform: registry?.platform || null,
      entityCategory: registry?.entityCategory || null,
      hidden: registry?.hidden === true,
      disabled: false
    };
  }).filter(entity => normalizeEntityId(entity.entityId));

  function getDeviceGroupKey(deviceId) {
    if (!deviceGroupById.has(deviceId)) {
      deviceGroupById.set(deviceId, `device-${nextDeviceGroup++}`);
    }
    return deviceGroupById.get(deviceId);
  }
}

function pickStateFields(entity) {
  return {
    entityId: entity.entityId,
    domain: entity.domain,
    displayName: entity.displayName,
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

function isAdvancedDiscoveryEntity(entity) {
  return entity?.hidden === true || ["diagnostic", "config"].includes(entity?.entityCategory);
}

module.exports = { createDiscoveryEntities, isAdvancedDiscoveryEntity };
