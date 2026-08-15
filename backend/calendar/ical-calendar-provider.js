const ical = require("node-ical");
const { CalendarFeedCache } = require("./calendar-feed-cache");

const DEFAULT_ICAL_REQUEST_TIMEOUT_MS = 10 * 1000;
const DEFAULT_ICAL_RESPONSE_LIMIT_BYTES = 5 * 1024 * 1024;

class IcalCalendarProvider {

  constructor({
    sources = [],
    fetchImpl = globalThis.fetch,
    cache = new CalendarFeedCache(),
    requestTimeoutMs = DEFAULT_ICAL_REQUEST_TIMEOUT_MS,
    responseLimitBytes = DEFAULT_ICAL_RESPONSE_LIMIT_BYTES
  } = {}) {
    this.id = "ical";
    this.name = "iCalendar";
    this.sources = sources;
    this.fetchImpl = fetchImpl;
    this.cache = cache;
    this.requestTimeoutMs = requestTimeoutMs;
    this.responseLimitBytes = responseLimitBytes;
  }

  getSources() {
    return this.sources.map((source) => ({ ...source }));
  }

  async getEvents({ start, end, sources = this.getSources() }) {
    const range = this.normalizeRange(start, end);
    const enabledSources = Array.isArray(sources)
      ? sources.filter((source) => source?.enabled !== false)
      : [];

    if (enabledSources.length === 0) return [];

    const results = await Promise.allSettled(
      enabledSources.map((source) =>
        this.getSourceEvents(source, range)
      )
    );
    const successfulResults = results.filter(
      (result) => result.status === "fulfilled"
    );

    if (successfulResults.length === 0) {
      throw new Error("Calendar sources are unavailable.");
    }

    return successfulResults
      .flatMap((result) => result.value)
      .sort((first, second) =>
        first.startTime.getTime() - second.startTime.getTime()
      );
  }

  normalizeRange(start, end) {
    const rangeStart = new Date(start);
    const rangeEnd = new Date(end);

    if (
      !Number.isFinite(rangeStart.getTime()) ||
      !Number.isFinite(rangeEnd.getTime()) ||
      rangeEnd <= rangeStart
    ) {
      throw new TypeError("Calendar event range is invalid.");
    }

    return { start: rangeStart, end: rangeEnd };
  }

  async getSourceEvents(source, range) {
    this.validateSource(source);

    const cached = this.cache.get(source.id);
    const fresh = this.cache.getFresh(source.id);

    if (fresh) {
      return this.parseSource(fresh.content, source, range);
    }

    try {
      const fetched = await this.fetchSource(source, cached);
      const events = await this.parseSource(
        fetched.content,
        source,
        range
      );

      if (fetched.notModified) {
        this.cache.touch(source.id);
      } else {
        this.cache.set(source.id, fetched);
      }

      return events;
    } catch (error) {
      if (cached?.content) {
        return this.parseSource(cached.content, source, range);
      }

      throw new Error("Calendar source is unavailable.");
    }
  }

  validateSource(source) {
    if (
      typeof source?.id !== "string" ||
      !source.id.trim() ||
      typeof source?.name !== "string" ||
      !source.name.trim() ||
      typeof source?.url !== "string"
    ) {
      throw new TypeError("Calendar source configuration is invalid.");
    }

    const url = new URL(source.url);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:" &&
      url.protocol !== "webcal:"
    ) {
      throw new TypeError(
        "Calendar source URL must use HTTP, HTTPS, or webcal."
      );
    }
  }

  async fetchSource(source, cached) {
    if (typeof this.fetchImpl !== "function") {
      throw new Error("Calendar source fetching is unavailable.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs
    );
    const headers = {};

    if (cached?.etag) headers["If-None-Match"] = cached.etag;
    if (cached?.lastModified) {
      headers["If-Modified-Since"] = cached.lastModified;
    }

    try {
      const response = await this.fetchImpl(
        this.getFetchUrl(source.url),
        {
          headers,
          signal: controller.signal
        }
      );

      if (response.status === 304 && cached?.content) {
        return {
          content: cached.content,
          etag: cached.etag,
          lastModified: cached.lastModified,
          notModified: true
        };
      }

      if (!response.ok) {
        throw new Error("Calendar source request failed.");
      }

      const content = await this.readResponseText(response);

      return {
        content,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        notModified: false
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  getFetchUrl(configuredUrl) {
    return configuredUrl.replace(/^webcal:/i, "https:");
  }

  async readResponseText(response) {
    const declaredLength = Number(
      response.headers.get("content-length")
    );

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > this.responseLimitBytes
    ) {
      throw new Error("Calendar source response is too large.");
    }

    if (!response.body?.getReader) {
      const content = await response.text();

      if (Buffer.byteLength(content, "utf8") > this.responseLimitBytes) {
        throw new Error("Calendar source response is too large.");
      }

      return content;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > this.responseLimitBytes) {
        await reader.cancel();
        throw new Error("Calendar source response is too large.");
      }

      chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks).toString("utf8");
  }

  async parseSource(content, source, range) {
    if (
      typeof content !== "string" ||
      !/^BEGIN:VCALENDAR\s*$/im.test(content) ||
      !/^END:VCALENDAR\s*$/im.test(content)
    ) {
      throw new Error("Calendar source content is invalid.");
    }

    const components = await ical.async.parseICS(content);
    const events = [];

    for (const component of Object.values(components)) {
      if (
        component?.type !== "VEVENT" ||
        this.isCancelled(component)
      ) {
        continue;
      }

      const occurrences = component.rrule
        ? ical.expandRecurringEvent(component, {
            from: range.start,
            to: range.end,
            expandOngoing: true
          })
        : [component];

      for (const occurrence of occurrences) {
        if (this.isCancelled(occurrence)) continue;

        const normalized = this.normalizeEvent(
          occurrence,
          component,
          source,
          range
        );

        if (normalized) events.push(normalized);
      }
    }

    return events;
  }

  normalizeEvent(occurrence, parent, source, range) {
    const startTime = this.toDate(occurrence.start || parent.start);
    const endTime = this.toDate(occurrence.end || parent.end);

    if (!startTime || !this.overlapsRange(startTime, endTime, range)) {
      return null;
    }

    const allDay = Boolean(
      occurrence.isFullDay ??
      occurrence.start?.dateOnly ??
      parent.start?.dateOnly ??
      parent.datetype === "date"
    );
    const uid = String(occurrence.uid || parent.uid || "event");
    const title = this.normalizeText(
      occurrence.summary || parent.summary
    ) || "Untitled event";
    const location = this.normalizeText(
      occurrence.location || parent.location
    );

    return {
      id:
        `ical:${source.id}:` +
        `${encodeURIComponent(uid)}:${startTime.toISOString()}`,
      title,
      startTime,
      endTime,
      allDay,
      location,
      calendar: {
        id: source.id,
        name: source.name
      },
      provider: {
        id: this.id
      }
    };
  }

  overlapsRange(startTime, endTime, range) {
    if (endTime && endTime > startTime) {
      return startTime < range.end && endTime > range.start;
    }

    return startTime >= range.start && startTime < range.end;
  }

  isCancelled(event) {
    return String(event?.status || "").toUpperCase() === "CANCELLED";
  }

  toDate(value) {
    if (!value) return null;

    const date = value instanceof Date ? value : new Date(value);

    return Number.isFinite(date.getTime()) ? date : null;
  }

  normalizeText(value) {
    return typeof value === "string" && value.trim()
      ? value.trim()
      : null;
  }

}

module.exports = {
  IcalCalendarProvider,
  DEFAULT_ICAL_REQUEST_TIMEOUT_MS,
  DEFAULT_ICAL_RESPONSE_LIMIT_BYTES
};
