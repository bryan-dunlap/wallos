const NORMALIZED_SPORTS_EVENT_TYPES = new Set(["game"]);
const NORMALIZED_SPORTS_STATUSES = new Set([
    "scheduled",
    "live",
    "final",
    "unknown"
]);

function createNormalizedSportsEvent(event) {
    const league = normalizeRequiredString(event?.league)?.toUpperCase();
    const id = normalizeRequiredString(event?.id);
    const type = normalizeRequiredString(event?.type);
    const status = normalizeRequiredString(event?.status)?.toLowerCase();
    const away = event?.participants?.away;
    const home = event?.participants?.home;

    if (
        !league ||
        !id ||
        !NORMALIZED_SPORTS_EVENT_TYPES.has(type) ||
        !NORMALIZED_SPORTS_STATUSES.has(status) ||
        !hasParticipantIdentity(away) ||
        !hasParticipantIdentity(home)
    ) {
        return null;
    }

    return {
        league,
        id,
        type,
        status,
        participants: {
            away: { ...away },
            home: { ...home }
        },
        scores: {
            away: event.scores?.away ?? null,
            home: event.scores?.home ?? null
        },
        state: isPlainObject(event.state) ? { ...event.state } : {},
        details: isPlainObject(event.details) ? { ...event.details } : {}
    };
}

function isNormalizedSportsEvent(event) {
    return createNormalizedSportsEvent(event) !== null;
}

function hasParticipantIdentity(participant) {
    return isPlainObject(participant) &&
        Boolean(normalizeRequiredString(participant.name));
}

function normalizeRequiredString(value) {
    return typeof value === "string" && value.trim()
        ? value.trim()
        : null;
}

function isPlainObject(value) {
    return Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        createNormalizedSportsEvent,
        isNormalizedSportsEvent
    };
}
