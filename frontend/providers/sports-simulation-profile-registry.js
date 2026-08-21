class SportsSimulationProfileRegistry {

    constructor(profiles = []) {
        this.profiles = new Map();
        profiles.forEach((profile) => this.register(profile));
    }

    register(profile) {
        if (!profile?.id || !Array.isArray(profile.scenarios)) {
            throw new TypeError("Invalid Sports simulation profile");
        }

        this.profiles.set(profile.id, profile);
    }

    getMetadata() {
        return [...this.profiles.values()].map((profile) => ({
            id: profile.id,
            name: profile.name,
            league: profile.league,
            sport: profile.sport,
            scenarios: profile.scenarios.map(({ id, label }) => ({
                id,
                label
            }))
        }));
    }

    createFacts(profileId, scenarioId) {
        const profile = this.profiles.get(profileId);
        const scenario = profile?.scenarios.find(
            ({ id }) => id === scenarioId
        );

        if (!profile || !scenario) return null;

        return scenario.stateFactory(profile);
    }

}

const simulationTeams = {
    MLB: {
        away: createSimulationTeam(
            "SEA", "Seattle Mariners", "Mariners", "MLB", "baseball",
            136
        ),
        home: createSimulationTeam(
            "LAA", "Los Angeles Angels", "Angels", "MLB", "baseball",
            108
        )
    },
    NFL: {
        away: createSimulationTeam(
            "NFL:SEA", "Seattle Seahawks", "Seahawks", "NFL", "football"
        ),
        home: createSimulationTeam(
            "NFL:SF", "San Francisco 49ers", "49ers", "NFL", "football"
        )
    },
    NBA: {
        away: createSimulationTeam(
            "NBA:GSW", "Golden State Warriors", "Warriors", "NBA", "basketball"
        ),
        home: createSimulationTeam(
            "NBA:LAL", "Los Angeles Lakers", "Lakers", "NBA", "basketball"
        )
    },
    NHL: {
        away: createSimulationTeam(
            "NHL:SEA", "Seattle Kraken", "Kraken", "NHL", "hockey"
        ),
        home: createSimulationTeam(
            "NHL:VAN", "Vancouver Canucks", "Canucks", "NHL", "hockey"
        )
    }
};

function createSimulationTeam(
    id,
    name,
    shortName,
    league,
    sport,
    providerId = null
) {
    return {
        id,
        name,
        shortName,
        league,
        sport,
        providerId,
        logo: providerId
            ? `https://www.mlbstatic.com/team-logos/${providerId}.svg`
            : ""
    };
}

function createBaseGame(profile, status, details = {}) {
    const startTime = new Date();
    startTime.setHours(19, 10, 0, 0);

    return {
        status,
        sport: profile.sport,
        league: profile.league,
        teams: profile.teams,
        opponent: profile.teams.home.name,
        startTime: startTime.toISOString(),
        score: null,
        result: null,
        ...details
    };
}

function createFacts(profile, game) {
    return {
        status: "available",
        simulation: true,
        favoriteTeam: profile.teams.away,
        game
    };
}

function scenario(id, label, stateFactory) {
    return { id, label, stateFactory };
}

function scheduledScenario(id, label, phase = "scheduled") {
    return scenario(id, label, (profile) => createFacts(
        profile,
        createBaseGame(profile, "scheduled", { phase })
    ));
}

function finalScenario(score, result) {
    return scenario("final", "Final", (profile) => createFacts(
        profile,
        createBaseGame(profile, "final", { score, result })
    ));
}

function createMlbLiveScenario(id, label, overrides = {}) {
    return scenario(id, label, (profile) => {
        const inning = overrides.inning || { half: "bottom", number: 7 };
        const score = overrides.score || {
            away: 3,
            home: 2,
            favoriteTeam: 3,
            opponent: 2
        };
        const innings = Array.from({ length: inning.number }, (_, index) => ({
            number: index + 1,
            away: [0, 1, 0, 0, 0, 2, 0, 0, 0, 1][index] ?? null,
            home: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0][index] ?? null
        }));

        return createFacts(profile, createBaseGame(profile, "live", {
            score,
            inning,
            outs: overrides.outs ?? 1,
            count: overrides.count || { balls: 2, strikes: 1 },
            bases: overrides.bases || {
                first: false,
                second: true,
                third: false
            },
            batter: {
                name: "Julio Rodríguez",
                hits: 1,
                atBats: 4,
                seasonAVG: ".298"
            },
            pitcher: {
                name: "Logan Gilbert",
                strikes: 25,
                pitches: 50,
                seasonERA: "3.42"
            },
            lineScore: {
                innings: innings.map((value) => ({
                    ...value,
                    favoriteTeam: value.away,
                    opponent: value.home
                })),
                away: { runs: score.away, hits: 7, errors: 0 },
                home: { runs: score.home, hits: 6, errors: 0 },
                favoriteTeam: { runs: score.away, hits: 7, errors: 0 },
                opponent: { runs: score.home, hits: 6, errors: 0 }
            }
        }));
    });
}

function createClockSportScenario(id, label, details) {
    return scenario(id, label, (profile) => createFacts(
        profile,
        createBaseGame(profile, "live", details)
    ));
}

const sportsSimulationProfileRegistry =
    new SportsSimulationProfileRegistry([
        {
            id: "MLB",
            name: "MLB",
            league: "MLB",
            sport: "baseball",
            teams: simulationTeams.MLB,
            scenarios: [
                scheduledScenario("scheduled", "Scheduled"),
                scheduledScenario("pregame", "Pregame", "pregame"),
                createMlbLiveScenario("live-top", "Live — Top Inning", {
                    inning: { half: "top", number: 7 }
                }),
                createMlbLiveScenario("live-bottom", "Live — Bottom Inning"),
                createMlbLiveScenario("runners-on", "Live — Runners On", {
                    bases: { first: true, second: true, third: false }
                }),
                createMlbLiveScenario("full-count", "Live — Full Count / 2 Outs", {
                    count: { balls: 3, strikes: 2 },
                    outs: 2
                }),
                createMlbLiveScenario("extra-innings", "Extra Innings", {
                    inning: { half: "top", number: 10 },
                    score: { away: 4, home: 4, favoriteTeam: 4, opponent: 4 }
                }),
                finalScenario(
                    { away: 5, home: 3, favoriteTeam: 5, opponent: 3 },
                    "Mariners win 5-3"
                )
            ]
        },
        {
            id: "NFL",
            name: "NFL",
            league: "NFL",
            sport: "football",
            teams: simulationTeams.NFL,
            scenarios: [
                scheduledScenario("scheduled", "Scheduled"),
                scheduledScenario("pregame", "Pregame", "pregame"),
                createClockSportScenario("q1", "Live — 1st Quarter", { score: { away: 7, home: 3 }, quarter: 1, gameClock: "08:42", possession: "away", down: 2, distance: 6, yardLine: "SF 38", redZone: false, timeouts: { away: 3, home: 3 } }),
                createClockSportScenario("q2", "Live — 2nd Quarter", { score: { away: 10, home: 10 }, quarter: 2, gameClock: "06:18", possession: "home", down: 3, distance: 4, yardLine: "SF 46", redZone: false }),
                createClockSportScenario("halftime", "Halftime", { score: { away: 17, home: 13 }, quarter: 2, gameClock: "HALF", phase: "halftime" }),
                createClockSportScenario("q3", "Live — 3rd Quarter", { score: { away: 20, home: 16 }, quarter: 3, gameClock: "09:11", possession: "away", down: 1, distance: 10, yardLine: "SEA 35" }),
                createClockSportScenario("q4", "Live — 4th Quarter", { score: { away: 24, home: 23 }, quarter: 4, gameClock: "04:09", possession: "home", down: 2, distance: 8, yardLine: "SF 42" }),
                createClockSportScenario("red-zone", "Red Zone", { score: { away: 24, home: 23 }, quarter: 4, gameClock: "02:48", possession: "away", down: 1, distance: 10, yardLine: "SF 18", redZone: true }),
                createClockSportScenario("two-minute", "Two-Minute Drill", { score: { away: 24, home: 27 }, quarter: 4, gameClock: "01:42", possession: "away", down: 2, distance: 5, yardLine: "SEA 44" }),
                createClockSportScenario("overtime", "Overtime", { score: { away: 27, home: 27 }, quarter: 5, gameClock: "07:22", possession: "home", down: 1, distance: 10, yardLine: "SF 25", phase: "overtime" }),
                finalScenario({ away: 30, home: 27 }, "Seahawks win 30-27")
            ]
        },
        {
            id: "NBA",
            name: "NBA",
            league: "NBA",
            sport: "basketball",
            teams: simulationTeams.NBA,
            scenarios: [
                scheduledScenario("scheduled", "Scheduled"),
                scheduledScenario("pregame", "Pregame", "pregame"),
                createClockSportScenario("q1", "Live — 1st Quarter", { score: { away: 24, home: 22 }, quarter: 1, gameClock: "02:41", possession: "home", teamFouls: { away: 3, home: 4 }, timeouts: { away: 6, home: 6 } }),
                createClockSportScenario("q2", "Live — 2nd Quarter", { score: { away: 51, home: 49 }, quarter: 2, gameClock: "03:18", possession: "away", teamFouls: { away: 4, home: 2 } }),
                createClockSportScenario("halftime", "Halftime", { score: { away: 58, home: 55 }, quarter: 2, gameClock: "HALF", phase: "halftime" }),
                createClockSportScenario("q3", "Live — 3rd Quarter", { score: { away: 81, home: 79 }, quarter: 3, gameClock: "05:03", possession: "home" }),
                createClockSportScenario("q4", "Live — 4th Quarter", { score: { away: 104, home: 101 }, quarter: 4, gameClock: "01:56", possession: "away" }),
                createClockSportScenario("close-game", "Close Game", { score: { away: 112, home: 111 }, quarter: 4, gameClock: "00:18", possession: "home", timeouts: { away: 1, home: 1 } }),
                createClockSportScenario("overtime", "Overtime", { score: { away: 120, home: 120 }, quarter: 5, gameClock: "02:22", possession: "away", phase: "overtime" }),
                finalScenario({ away: 124, home: 121 }, "Warriors win 124-121")
            ]
        },
        {
            id: "NHL",
            name: "NHL",
            league: "NHL",
            sport: "hockey",
            teams: simulationTeams.NHL,
            scenarios: [
                scheduledScenario("scheduled", "Scheduled"),
                scheduledScenario("pregame", "Pregame", "pregame"),
                createClockSportScenario("p1", "Live — 1st Period", { score: { away: 1, home: 0 }, period: 1, gameClock: "12:18", strength: "5-on-5", shotsOnGoal: { away: 8, home: 5 } }),
                createClockSportScenario("p2", "Live — 2nd Period", { score: { away: 2, home: 1 }, period: 2, gameClock: "09:44", strength: "5-on-5", shotsOnGoal: { away: 18, home: 14 } }),
                createClockSportScenario("intermission", "Intermission", { score: { away: 2, home: 1 }, period: 2, gameClock: "INT", phase: "intermission" }),
                createClockSportScenario("p3", "Live — 3rd Period", { score: { away: 3, home: 2 }, period: 3, gameClock: "06:31", strength: "5-on-5", shotsOnGoal: { away: 29, home: 27 } }),
                createClockSportScenario("power-play", "Power Play", { score: { away: 3, home: 2 }, period: 3, gameClock: "03:12", strength: "5-on-4", powerPlay: { team: "away", remaining: "01:14" } }),
                createClockSportScenario("overtime", "Overtime", { score: { away: 3, home: 3 }, period: 4, gameClock: "02:08", strength: "3-on-3", phase: "overtime" }),
                createClockSportScenario("shootout", "Shootout", { score: { away: 3, home: 3 }, period: 5, gameClock: "SO", phase: "shootout" }),
                finalScenario({ away: 4, home: 3 }, "Kraken win 4-3")
            ]
        }
    ]);

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        SportsSimulationProfileRegistry,
        sportsSimulationProfileRegistry
    };
}

if (typeof window !== "undefined") {
    window.sportsSimulationProfileRegistry =
        sportsSimulationProfileRegistry;
}
