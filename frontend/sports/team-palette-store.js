const TEAM_PALETTE_BATCH_LIMIT = 8;
const TEAM_PALETTE_SCHEMA_VERSION = 1;
const TEAM_PALETTE_ALGORITHM_VERSION = 1;

class TeamPaletteStore {

    constructor(options = {}) {
        this.fetch = options.fetch || globalThis.fetch?.bind(globalThis);
        this.endpoint = options.endpoint || "/api/team-palettes/resolve";
        this.cache = new Map();
        this.inFlight = new Map();
    }

    preload(teams) {
        const targets = this.normalizeTargets(teams);
        const pending = targets
            .map((target) => this.inFlight.get(target.key))
            .filter(Boolean);
        const unresolved = targets.filter(
            (target) => !this.cache.has(target.key) &&
                !this.inFlight.has(target.key)
        );

        if (unresolved.length && typeof this.fetch === "function") {
            const batches = this.createBatches(unresolved);
            pending.push(...batches.map((batch) => this.preloadBatch(batch)));
        }

        return Promise.all(pending).then(() => undefined, () => undefined);
    }

    getCached(team) {
        const target = this.normalizeTarget(team);
        return target ? this.cache.get(target.key) || null : null;
    }

    normalizeTargets(teams) {
        if (!Array.isArray(teams)) return [];
        const seen = new Set();
        const targets = [];

        for (const team of teams) {
            const target = this.normalizeTarget(team);
            if (!target || seen.has(target.key)) continue;
            seen.add(target.key);
            targets.push(target);
        }

        return targets;
    }

    normalizeTarget(team) {
        const teamId = typeof team?.teamId === "string"
            ? team.teamId.trim().toUpperCase()
            : "";
        const logoUrl = this.normalizeLogoUrl(team?.logoUrl);

        if (!/^[A-Z0-9]+:[A-Z0-9][A-Z0-9._-]*$/.test(teamId) || !logoUrl) {
            return null;
        }

        return {
            teamId,
            logoUrl,
            key: `${teamId}\n${logoUrl}`
        };
    }

    normalizeLogoUrl(value) {
        if (typeof value !== "string" || !value.trim()) return "";
        try {
            const url = new URL(value.trim());
            return url.protocol === "https:" ? url.href : "";
        } catch {
            return "";
        }
    }

    createBatches(targets) {
        const batches = [];

        for (const target of targets) {
            let batch = batches.at(-1);
            if (
                !batch ||
                batch.length >= TEAM_PALETTE_BATCH_LIMIT ||
                batch.some((item) => item.teamId === target.teamId)
            ) {
                batch = [];
                batches.push(batch);
            }
            batch.push(target);
        }

        return batches;
    }

    preloadBatch(batch) {
        const request = this.requestBatch(batch)
            .catch(() => undefined)
            .finally(() => {
                for (const target of batch) {
                    if (this.inFlight.get(target.key) === request) {
                        this.inFlight.delete(target.key);
                    }
                }
            });

        for (const target of batch) this.inFlight.set(target.key, request);
        return request;
    }

    async requestBatch(batch) {
        const response = await this.fetch(this.endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                teams: batch.map(({ teamId, logoUrl }) => ({
                    teamId,
                    logoUrl
                }))
            })
        });

        if (!response?.ok) return;
        const body = await response.json();
        if (!body?.palettes || typeof body.palettes !== "object") return;

        for (const target of batch) {
            const palette = this.validatePalette(
                body.palettes[target.teamId],
                target.teamId
            );
            if (palette) this.cache.set(target.key, palette);
        }
    }

    validatePalette(value, expectedTeamId) {
        if (
            value?.schemaVersion !== TEAM_PALETTE_SCHEMA_VERSION ||
            value?.algorithmVersion !== TEAM_PALETTE_ALGORITHM_VERSION ||
            value?.teamId !== expectedTeamId ||
            value?.source?.type !== "logo" ||
            typeof value.source.identity !== "string" ||
            !value.source.identity.trim()
        ) {
            return null;
        }

        const colors = {};
        for (const name of [
            "primary",
            "secondary",
            "accent",
            "textOnPrimary"
        ]) {
            const color = this.normalizeHex(value[name]);
            if (!color) return null;
            colors[name] = color;
        }

        return {
            schemaVersion: TEAM_PALETTE_SCHEMA_VERSION,
            algorithmVersion: TEAM_PALETTE_ALGORITHM_VERSION,
            teamId: expectedTeamId,
            ...colors,
            source: {
                type: "logo",
                identity: value.source.identity.trim()
            }
        };
    }

    normalizeHex(value) {
        return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
            ? value.toUpperCase()
            : "";
    }

}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        TeamPaletteStore,
        TEAM_PALETTE_BATCH_LIMIT,
        TEAM_PALETTE_SCHEMA_VERSION,
        TEAM_PALETTE_ALGORITHM_VERSION
    };
}
