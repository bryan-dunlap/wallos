class ScoreEventDetector {

    constructor(options = {}) {
        this.onEvent = typeof options.onEvent === "function"
            ? options.onEvent
            : () => {};
        this.now = typeof options.now === "function"
            ? options.now
            : () => new Date();
        this.activeGameId = null;
        this.baseline = null;
    }

    accept(snapshot) {
        const current = this.normalizeSnapshot(snapshot);

        if (!current || current.stale) return [];

        if (this.activeGameId !== current.gameId || !this.baseline) {
            this.activeGameId = current.gameId;
            this.baseline = current;
            return [];
        }

        if (
            current.sourceRevision !== null &&
            current.sourceRevision === this.baseline.sourceRevision
        ) {
            return [];
        }

        const previous = this.baseline;
        this.baseline = current;
        const observedAt = this.normalizeTimestamp(this.now()) ||
            new Date().toISOString();
        const events = ["away", "home"].flatMap((side) => {
            const points = current.score[side] - previous.score[side];

            return points > 0
                ? [this.createEvent(previous, current, side, points, observedAt)]
                : [];
        });

        events.forEach((event) => this.onEvent(event));
        return events;
    }

    reset() {
        this.activeGameId = null;
        this.baseline = null;
    }

    disarm() {
        this.reset();
    }

    createEvent(previous, current, side, points, observedAt) {
        const providerEvent = current.providerEvent;
        const providerEventId = providerEvent?.id || null;
        const eventType = current.league === "MLB" ? "run" : "score";
        const transition = [
            previous.score.away,
            previous.score.home,
            current.score.away,
            current.score.home
        ].join("-");
        const discriminator = providerEventId ||
            current.sourceRevision ||
            transition;

        return {
            schemaVersion: 1,
            id: `gamecast-score:${current.gameId}:${side}:${discriminator}`,
            gameId: current.gameId,
            sport: current.sport,
            league: current.league,
            scoringTeamId: current.teams[side].id,
            scoringSide: side,
            eventType,
            points,
            intensity: "score",
            previousScore: { ...previous.score },
            currentScore: { ...current.score },
            providerEventId,
            period: providerEvent?.period ?? null,
            gameClock: providerEvent?.gameClock || null,
            occurredAt: providerEvent?.occurredAt || null,
            observedAt,
            sourceRevision: current.sourceRevision
        };
    }

    normalizeSnapshot(snapshot) {
        if (
            snapshot?.schemaVersion !== 1 ||
            typeof snapshot.gameId !== "string" ||
            !snapshot.gameId.includes(":") ||
            typeof snapshot.sport !== "string" ||
            typeof snapshot.league !== "string" ||
            !Number.isFinite(snapshot.score?.away) ||
            !Number.isFinite(snapshot.score?.home) ||
            typeof snapshot.teams?.away?.id !== "string" ||
            typeof snapshot.teams?.home?.id !== "string"
        ) {
            return null;
        }

        return {
            schemaVersion: 1,
            gameId: snapshot.gameId,
            sport: snapshot.sport,
            league: snapshot.league.toUpperCase(),
            score: {
                away: snapshot.score.away,
                home: snapshot.score.home
            },
            teams: {
                away: { id: snapshot.teams.away.id },
                home: { id: snapshot.teams.home.id }
            },
            stale: snapshot.stale === true,
            sourceRevision: snapshot.sourceRevision ?? null,
            providerEvent: snapshot.providerEvent || null
        };
    }

    normalizeTimestamp(value) {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }

}

function qualifyGamecastIdentity(league, value) {
    const normalizedLeague = String(league || "").trim().toUpperCase();
    const normalizedValue = String(value ?? "").trim().toUpperCase();

    if (!normalizedLeague || !normalizedValue) return null;
    if (normalizedValue.startsWith(`${normalizedLeague}:`)) {
        return normalizedValue;
    }

    return `${normalizedLeague}:${normalizedValue}`;
}

function createDetailedGamecastSnapshot({
    gameId,
    sport,
    league,
    score,
    teams,
    stale = false,
    sourceRevision = null,
    providerEvent = null
}) {
    const normalizedLeague = String(league || "").trim().toUpperCase();
    const snapshot = {
        schemaVersion: 1,
        gameId: qualifyGamecastIdentity(normalizedLeague, gameId),
        sport: String(sport || "").trim().toLowerCase(),
        league: normalizedLeague,
        score: {
            away: score?.away,
            home: score?.home
        },
        teams: {
            away: {
                id: qualifyGamecastIdentity(
                    normalizedLeague,
                    teams?.away?.abbreviation || teams?.away?.id
                )
            },
            home: {
                id: qualifyGamecastIdentity(
                    normalizedLeague,
                    teams?.home?.abbreviation || teams?.home?.id
                )
            }
        },
        stale: stale === true,
        sourceRevision: sourceRevision ?? null,
        providerEvent: providerEvent || null
    };

    return snapshot;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        ScoreEventDetector,
        createDetailedGamecastSnapshot,
        qualifyGamecastIdentity
    };
}
