const { randomUUID } = require("node:crypto");

const MAX_TIMER_DELAY = 2_147_000_000;

class AttentionOverrideRegistry {
  constructor({
    now = () => Date.now(),
    setTimeout: scheduleTimeout = setTimeout,
    clearTimeout: cancelTimeout = clearTimeout,
    createId = randomUUID
  } = {}) {
    this.now = now;
    this.scheduleTimeout = scheduleTimeout;
    this.cancelTimeout = cancelTimeout;
    this.createId = createId;
    this.overrides = new Map();
    this.subscribers = new Set();
    this.expirationTimer = null;
  }

  activate(input = {}) {
    const id = typeof input.id === "string" && input.id.trim()
      ? input.id.trim()
      : this.createId();
    const override = this.normalizeOverride(id, input);

    if (override.expiresAt !== null && override.expiresAt <= this.now()) {
      this.deactivate(id);
      return id;
    }

    this.overrides.set(id, override);
    this.rescheduleExpiration();
    this.publish("activate", id);
    return id;
  }

  update(handle, update = {}) {
    const id = this.resolveId(handle);
    const current = this.overrides.get(id);

    if (!current) return false;

    const override = this.normalizeOverride(id, {
      ...current,
      ...update
    });

    if (override.expiresAt !== null && override.expiresAt <= this.now()) {
      return this.deactivate(id);
    }

    this.overrides.set(id, override);
    this.rescheduleExpiration();
    this.publish("update", id);
    return true;
  }

  deactivate(handle) {
    const id = this.resolveId(handle);
    const removed = this.overrides.delete(id);

    if (removed) {
      this.rescheduleExpiration();
      this.publish("deactivate", id);
    }

    return removed;
  }

  getActive() {
    this.pruneExpired();
    return [...this.overrides.values()].map((override) => ({ ...override }));
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Attention override subscriber must be a function.");
    }

    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  stop() {
    if (this.expirationTimer !== null) {
      this.cancelTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }
  }

  normalizeOverride(id, input) {
    const expiresAt = input.expiresAt === undefined || input.expiresAt === null
      ? null
      : new Date(input.expiresAt).getTime();

    if (input.expiresAt !== undefined && input.expiresAt !== null &&
        !Number.isFinite(expiresAt)) {
      throw new Error("Attention override expiration is invalid.");
    }

    return {
      id,
      source: typeof input.source === "string" ? input.source.trim() : "",
      reason: typeof input.reason === "string" ? input.reason.trim() : "",
      expiresAt
    };
  }

  resolveId(handle) {
    return typeof handle === "string" ? handle : handle?.id;
  }

  pruneExpired() {
    const now = this.now();
    const expiredIds = [...this.overrides.values()]
      .filter((override) =>
        override.expiresAt !== null && override.expiresAt <= now
      )
      .map((override) => override.id);

    if (expiredIds.length === 0) return false;

    expiredIds.forEach((id) => this.overrides.delete(id));
    this.rescheduleExpiration();
    this.publish("expire", expiredIds);
    return true;
  }

  rescheduleExpiration() {
    if (this.expirationTimer !== null) {
      this.cancelTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }

    const expirations = [...this.overrides.values()]
      .map((override) => override.expiresAt)
      .filter(Number.isFinite);

    if (expirations.length === 0) return;

    const delay = Math.max(
      0,
      Math.min(Math.min(...expirations) - this.now(), MAX_TIMER_DELAY)
    );
    this.expirationTimer = this.scheduleTimeout(() => {
      this.expirationTimer = null;
      this.pruneExpired();
      this.rescheduleExpiration();
    }, delay);
  }

  publish(type, id) {
    const event = {
      type,
      id,
      active: [...this.overrides.values()].map((override) => ({ ...override }))
    };

    this.subscribers.forEach((listener) => listener(event));
  }
}

module.exports = { AttentionOverrideRegistry };
