const { createHash } = require("node:crypto");
const {
  TEAM_PALETTE_ALGORITHM_VERSION,
  extractTeamPalette,
  normalizeTeamId
} = require("./team-palette-extractor");

const DEFAULT_NEGATIVE_CACHE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_REVALIDATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

class TeamPaletteResolver {
  constructor({
    cache,
    fetcher,
    extract = extractTeamPalette,
    now = Date.now,
    negativeCacheMs = DEFAULT_NEGATIVE_CACHE_MS,
    revalidateAfterMs = DEFAULT_REVALIDATE_AFTER_MS
  } = {}) {
    if (!cache || !fetcher) {
      throw new TypeError("TeamPaletteResolver requires cache and fetcher.");
    }

    this.cache = cache;
    this.fetcher = fetcher;
    this.extract = extract;
    this.now = now;
    this.negativeCacheMs = negativeCacheMs;
    this.revalidateAfterMs = revalidateAfterMs;
    this.hotCache = new Map();
    this.inFlight = new Map();
  }

  async resolve(input) {
    const request = this.normalizeRequest(input);
    if (!request) return null;

    try {
      await this.cache.load();
      const key = createRequestKey(request.teamId, request.logoUrl);
      const hot = this.hotCache.get(key);
      if (hot) return clone(hot);

      const persisted = this.cache.getEntry(
        request.teamId,
        request.logoUrl,
        TEAM_PALETTE_ALGORITHM_VERSION
      );
      if (persisted) {
        this.hotCache.set(key, persisted.palette);
        return clone(persisted.palette);
      }

      if (this.cache.getActiveFailure(request.teamId, request.logoUrl)) {
        return null;
      }

      return await this.runDeduplicated(key, () => this.resolveUncached(request));
    } catch {
      return null;
    }
  }

  async revalidate(input) {
    const request = this.normalizeRequest(input);
    if (!request) return null;

    try {
      await this.cache.load();
      const entry = this.cache.getEntry(
        request.teamId,
        request.logoUrl,
        TEAM_PALETTE_ALGORITHM_VERSION
      );
      if (!entry) return this.resolve(request);

      if (
        this.now() - Date.parse(entry.lastCheckedAt) < this.revalidateAfterMs
      ) {
        return clone(entry.palette);
      }

      if (this.cache.getActiveFailure(request.teamId, request.logoUrl)) {
        return clone(entry.palette);
      }

      const key = createRequestKey(request.teamId, request.logoUrl);
      return await this.runDeduplicated(key, () =>
        this.revalidateEntry(request, entry)
      );
    } catch {
      return null;
    }
  }

  normalizeRequest(input) {
    const teamId = normalizeTeamId(input?.teamId);
    const logoUrl = this.fetcher.normalizeUrl(input?.logoUrl);
    return teamId && logoUrl ? { teamId, logoUrl } : null;
  }

  runDeduplicated(key, operation) {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const work = Promise.resolve()
      .then(operation)
      .catch(() => null)
      .finally(() => {
        if (this.inFlight.get(key) === work) this.inFlight.delete(key);
      });
    this.inFlight.set(key, work);
    return work;
  }

  async resolveUncached(request) {
    const fetched = await this.fetcher.fetch(request.logoUrl);
    if (!fetched.ok || fetched.notModified) {
      await this.rememberFailure(request, fetched.reasonCode || "fetch_failed");
      return null;
    }

    const sourceIdentity = hashBytes(fetched.bytes);
    const prior = this.cache.getAnyEntry(request.teamId);
    let palette = null;

    if (
      prior?.algorithmVersion === TEAM_PALETTE_ALGORITHM_VERSION &&
      prior.sourceIdentity === sourceIdentity
    ) {
      palette = prior.palette;
    } else {
      palette = await this.extract({
        bytes: fetched.bytes,
        contentType: fetched.contentType,
        teamId: request.teamId,
        sourceIdentity
      });
    }

    if (!palette) {
      await this.rememberFailure(request, "extraction_failed");
      return null;
    }

    return this.rememberSuccess(request, fetched, palette, sourceIdentity);
  }

  async revalidateEntry(request, entry) {
    const fetched = await this.fetcher.fetch(request.logoUrl, {
      etag: entry.etag,
      lastModified: entry.lastModified
    });

    if (!fetched.ok) {
      await this.rememberFailure(request, fetched.reasonCode || "fetch_failed");
      return clone(entry.palette);
    }

    if (fetched.notModified) {
      await this.cache.touchEntry(request.teamId, {
        lastCheckedAt: toIso(this.now()),
        etag: fetched.etag,
        lastModified: fetched.lastModified
      });
      return clone(entry.palette);
    }

    const sourceIdentity = hashBytes(fetched.bytes);
    if (sourceIdentity === entry.sourceIdentity) {
      await this.cache.touchEntry(request.teamId, {
        lastCheckedAt: toIso(this.now()),
        etag: fetched.etag,
        lastModified: fetched.lastModified
      });
      return clone(entry.palette);
    }

    const palette = await this.extract({
      bytes: fetched.bytes,
      contentType: fetched.contentType,
      teamId: request.teamId,
      sourceIdentity
    });
    if (!palette) {
      await this.rememberFailure(request, "extraction_failed");
      return clone(entry.palette);
    }

    return this.rememberSuccess(request, fetched, palette, sourceIdentity);
  }

  async rememberSuccess(request, fetched, palette, sourceIdentity) {
    const timestamp = toIso(this.now());
    const record = {
      algorithmVersion: TEAM_PALETTE_ALGORITHM_VERSION,
      sourceUrl: request.logoUrl,
      sourceIdentity,
      etag: fetched.etag || null,
      lastModified: fetched.lastModified || null,
      resolvedAt: timestamp,
      lastCheckedAt: timestamp,
      palette: clone(palette)
    };
    const key = createRequestKey(request.teamId, request.logoUrl);
    this.hotCache.set(key, clone(palette));
    await this.cache.setSuccess(request.teamId, record);
    return clone(palette);
  }

  async rememberFailure(request, reasonCode) {
    const failedAt = this.now();
    await this.cache.setFailure(request.teamId, {
      sourceUrl: request.logoUrl,
      failedAt: toIso(failedAt),
      retryAfter: toIso(failedAt + this.negativeCacheMs),
      reasonCode: normalizeReasonCode(reasonCode)
    });
  }
}

function createRequestKey(teamId, logoUrl) {
  return `${teamId}\u0000${logoUrl}`;
}

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function normalizeReasonCode(value) {
  return typeof value === "string" && /^[a-z0-9_]+$/.test(value)
    ? value
    : "unknown_failure";
}

function toIso(timestamp) {
  return new Date(timestamp).toISOString();
}

function clone(value) {
  return structuredClone(value);
}

module.exports = {
  DEFAULT_NEGATIVE_CACHE_MS,
  DEFAULT_REVALIDATE_AFTER_MS,
  TeamPaletteResolver,
  createRequestKey,
  hashBytes
};
