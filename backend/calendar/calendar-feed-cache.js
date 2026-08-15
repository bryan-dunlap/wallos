const DEFAULT_CALENDAR_FEED_CACHE_MS = 5 * 60 * 1000;

class CalendarFeedCache {

  constructor({
    ttlMs = DEFAULT_CALENDAR_FEED_CACHE_MS,
    now = () => Date.now()
  } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  get(sourceId) {
    return this.entries.get(sourceId) || null;
  }

  getFresh(sourceId) {
    const entry = this.get(sourceId);

    if (!entry) return null;

    return this.now() - entry.fetchedAt < this.ttlMs
      ? entry
      : null;
  }

  set(sourceId, value) {
    const entry = {
      content: value.content,
      etag: value.etag || null,
      lastModified: value.lastModified || null,
      fetchedAt: this.now()
    };

    this.entries.set(sourceId, entry);

    return entry;
  }

  touch(sourceId) {
    const entry = this.get(sourceId);

    if (!entry) return null;

    entry.fetchedAt = this.now();

    return entry;
  }

}

module.exports = {
  CalendarFeedCache,
  DEFAULT_CALENDAR_FEED_CACHE_MS
};
