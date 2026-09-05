const DEFAULT_HOME_ASSISTANT_CONFIG = Object.freeze({
  enabled: false,
  baseUrl: "",
  accessToken: ""
});

function normalizeHomeAssistantConfig(config) {
  const enabled = typeof config?.enabled === "boolean"
    ? config.enabled
    : DEFAULT_HOME_ASSISTANT_CONFIG.enabled;
  const baseUrl = normalizeHomeAssistantBaseUrl(config?.baseUrl);
  const accessToken = normalizeHomeAssistantAccessToken(
    config?.accessToken
  );

  return {
    enabled,
    baseUrl: baseUrl || "",
    accessToken
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

function isHomeAssistantConfigured(config) {
  const normalized = normalizeHomeAssistantConfig(config);

  return Boolean(normalized.baseUrl && normalized.accessToken);
}

function createPublicHomeAssistantConfig(config) {
  const normalized = normalizeHomeAssistantConfig(config);

  return {
    enabled: normalized.enabled,
    baseUrl: normalized.baseUrl,
    configured: isHomeAssistantConfigured(normalized)
  };
}

module.exports = {
  DEFAULT_HOME_ASSISTANT_CONFIG,
  createPublicHomeAssistantConfig,
  isHomeAssistantConfigured,
  normalizeHomeAssistantAccessToken,
  normalizeHomeAssistantBaseUrl,
  normalizeHomeAssistantConfig
};
