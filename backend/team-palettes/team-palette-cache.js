const fs = require("node:fs");
const path = require("node:path");
const { normalizeHex } = require("./color-utils");
const {
  TEAM_PALETTE_SCHEMA_VERSION
} = require("./team-palette-extractor");

const TEAM_PALETTE_CACHE_SCHEMA_VERSION = 1;

class TeamPaletteCache {
  constructor({
    filePath,
    fsImpl = fs.promises,
    now = Date.now
  } = {}) {
    this.filePath = filePath;
    this.fs = fsImpl;
    this.now = now;
    this.entries = new Map();
    this.failures = new Map();
    this.loaded = false;
    this.loadPromise = null;
    this.writeQueue = Promise.resolve(true);
  }

  async load() {
    if (this.loaded) return this;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadFromDisk().finally(() => {
      this.loaded = true;
      this.loadPromise = null;
    });
    await this.loadPromise;
    return this;
  }

  async loadFromDisk() {
    if (!this.filePath) return;

    try {
      const parsed = JSON.parse(await this.fs.readFile(this.filePath, "utf8"));
      if (parsed?.schemaVersion !== TEAM_PALETTE_CACHE_SCHEMA_VERSION) return;

      for (const [teamId, record] of Object.entries(parsed.entries || {})) {
        if (isValidEntry(teamId, record)) this.entries.set(teamId, record);
      }
      for (const [teamId, record] of Object.entries(parsed.failures || {})) {
        if (isValidFailure(teamId, record)) this.failures.set(teamId, record);
      }
    } catch {
      this.entries.clear();
      this.failures.clear();
    }
  }

  getEntry(teamId, sourceUrl, algorithmVersion) {
    const record = this.entries.get(teamId);
    return record &&
      record.sourceUrl === sourceUrl &&
      record.algorithmVersion === algorithmVersion
      ? clone(record)
      : null;
  }

  getAnyEntry(teamId) {
    const record = this.entries.get(teamId);
    return record ? clone(record) : null;
  }

  getActiveFailure(teamId, sourceUrl, now = this.now()) {
    const record = this.failures.get(teamId);
    if (!record || record.sourceUrl !== sourceUrl) return null;

    return Date.parse(record.retryAfter) > now ? clone(record) : null;
  }

  async setSuccess(teamId, record) {
    this.entries.set(teamId, clone(record));
    this.failures.delete(teamId);
    return this.persist();
  }

  async touchEntry(teamId, updates) {
    const existing = this.entries.get(teamId);
    if (!existing) return false;
    this.entries.set(teamId, { ...existing, ...clone(updates) });
    this.failures.delete(teamId);
    return this.persist();
  }

  async setFailure(teamId, record) {
    this.failures.set(teamId, clone(record));
    return this.persist();
  }

  persist() {
    if (!this.filePath) return Promise.resolve(false);

    this.writeQueue = this.writeQueue
      .catch(() => false)
      .then(() => this.writeSnapshot())
      .catch(() => false);
    return this.writeQueue;
  }

  async writeSnapshot() {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.tmp-${process.pid}-${this.now()}-${Math.random().toString(16).slice(2)}`;
    const snapshot = JSON.stringify({
      schemaVersion: TEAM_PALETTE_CACHE_SCHEMA_VERSION,
      entries: Object.fromEntries(this.entries),
      failures: Object.fromEntries(this.failures)
    }, null, 2) + "\n";

    try {
      await this.fs.mkdir(directory, { recursive: true });
      await this.fs.writeFile(temporaryPath, snapshot, "utf8");
      await this.fs.rename(temporaryPath, this.filePath);
      return true;
    } catch {
      try {
        if (typeof this.fs.unlink === "function") {
          await this.fs.unlink(temporaryPath);
        }
      } catch {}
      return false;
    }
  }
}

function isValidEntry(teamId, record) {
  return Boolean(
    isQualifiedTeamId(teamId) &&
    Number.isInteger(record?.algorithmVersion) &&
    isHttpsUrl(record?.sourceUrl) &&
    /^sha256:[0-9a-f]{64}$/i.test(record?.sourceIdentity || "") &&
    isIsoDate(record?.resolvedAt) &&
    isIsoDate(record?.lastCheckedAt) &&
    isValidPalette(teamId, record?.palette)
  );
}

function isValidFailure(teamId, record) {
  return Boolean(
    isQualifiedTeamId(teamId) &&
    isHttpsUrl(record?.sourceUrl) &&
    isIsoDate(record?.failedAt) &&
    isIsoDate(record?.retryAfter) &&
    typeof record?.reasonCode === "string" &&
    /^[a-z0-9_]+$/.test(record.reasonCode)
  );
}

function isValidPalette(teamId, palette) {
  return Boolean(
    palette?.schemaVersion === TEAM_PALETTE_SCHEMA_VERSION &&
    Number.isInteger(palette?.algorithmVersion) &&
    palette.teamId === teamId &&
    normalizeHex(palette.primary) === palette.primary &&
    normalizeHex(palette.secondary) === palette.secondary &&
    normalizeHex(palette.accent) === palette.accent &&
    ["#000000", "#FFFFFF"].includes(palette.textOnPrimary) &&
    palette.source?.type === "logo" &&
    /^sha256:[0-9a-f]{64}$/i.test(palette.source?.identity || "")
  );
}

function isQualifiedTeamId(value) {
  return typeof value === "string" &&
    /^[A-Z0-9][A-Z0-9_-]*:[A-Z0-9][A-Z0-9_-]*$/.test(value);
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function clone(value) {
  return structuredClone(value);
}

module.exports = {
  TEAM_PALETTE_CACHE_SCHEMA_VERSION,
  TeamPaletteCache,
  isValidEntry,
  isValidFailure,
  isValidPalette
};
