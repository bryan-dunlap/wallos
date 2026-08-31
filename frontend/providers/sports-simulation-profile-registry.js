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
            "NFL:SEA", "Seattle Seahawks", "Seahawks", "NFL", "football",
            "26",
            "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png"
        ),
        home: createSimulationTeam(
            "NFL:SF", "San Francisco 49ers", "49ers", "NFL", "football",
            "25",
            "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png"
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
    providerId = null,
    logo = null
) {
    return {
        id,
        name,
        shortName,
        league,
        sport,
        providerId,
        logo: logo || (league === "MLB" && providerId
            ? `https://www.mlbstatic.com/team-logos/${providerId}.svg`
            : "")
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

function deriveSimulatedFirstDownYardLine(situation, possession) {
    const yardLine = Number(situation?.yardLine);
    const distance = Number(situation?.distance);
    const team = possession?.team;

    if (
        situation?.yardLine == null ||
        situation?.distance == null ||
        !Number.isFinite(yardLine) ||
        !Number.isFinite(distance) ||
        !["away", "home"].includes(team)
    ) {
        return null;
    }

    const direction = team === "away" ? 1 : -1;
    return Math.min(100, Math.max(0, yardLine + direction * distance));
}

function createFootballGamecast(profile, overrides = {}) {
    const base = {
        type: "football-game",
        status: "live",
        eventId: "simulation:nfl:sea-sf",
        teams: profile.teams,
        score: { away: 24, home: 23 },
        gameState: {
            quarter: 4,
            clock: "2:48",
            phase: "regulation"
        },
        possession: {
            team: "away",
            providerTeamId: "26"
        },
        situation: {
            down: 3,
            distance: 4,
            shortText: "3rd & 4",
            fieldPositionText: "SF 35",
            yardLine: 65,
            yardsToEndzone: 35,
            redZone: false
        },
        drive: {
            team: "away",
            plays: 8,
            yards: 62,
            elapsed: "4:17",
            result: null,
            start: { yardLine: 20, fieldPositionText: "SEA 20" },
            end: { yardLine: 65, fieldPositionText: "SF 35" }
        },
        lastPlay: {
            description: "G.Smith pass complete to D.Metcalf for 12 yards.",
            type: "Pass Reception",
            quarter: 4,
            clock: "2:48",
            start: { yardLine: 46 },
            end: { yardLine: 65 }
        },
        lineScore: {
            periods: [1, 2, 3, 4],
            away: [7, 3, 7, 7],
            home: [3, 7, 6, 7],
            overtime: { away: null, home: null }
        }
    };

    const gamecast = {
        ...base,
        ...overrides,
        gameState: { ...base.gameState, ...overrides.gameState },
        possession: overrides.possession === null
            ? null
            : { ...base.possession, ...overrides.possession },
        situation: overrides.situation === null
            ? null
            : { ...base.situation, ...overrides.situation },
        drive: overrides.drive === null
            ? null
            : { ...base.drive, ...overrides.drive },
        lastPlay: overrides.lastPlay === null
            ? null
            : { ...base.lastPlay, ...overrides.lastPlay },
        lineScore: { ...base.lineScore, ...overrides.lineScore }
    };

    if (gamecast.situation) {
        gamecast.situation.firstDownYardLine =
            deriveSimulatedFirstDownYardLine(
                gamecast.situation,
                gamecast.possession
            );
    }

    return gamecast;
}

function createNflGamecastScenario(id, label, overrides = {}) {
    return scenario(id, label, (profile) => {
        const gamecast = createFootballGamecast(profile, overrides);

        return createFacts(profile, createBaseGame(
            profile,
            gamecast.status,
            {
                score: gamecast.score,
                quarter: gamecast.gameState.quarter,
                gameClock: gamecast.gameState.clock,
                possession: gamecast.possession?.team ?? null,
                down: gamecast.situation?.down ?? null,
                distance: gamecast.situation?.distance ?? null,
                yardLine: gamecast.situation?.fieldPositionText ?? null,
                redZone: gamecast.situation?.redZone === true,
                phase: gamecast.gameState.phase,
                gamecast
            }
        ));
    });
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
                createNflGamecastScenario("live-drive", "Gamecast — Live Drive"),
                createNflGamecastScenario("red-zone", "Gamecast — Red Zone", {
                    situation: {
                        down: 3,
                        distance: 15,
                        shortText: "3rd & 15",
                        fieldPositionText: "SF 18",
                        yardLine: 82,
                        yardsToEndzone: 18,
                        redZone: true
                    }
                }),
                createNflGamecastScenario("goal-to-go", "Gamecast — Goal to Go", {
                    situation: {
                        down: 2,
                        distance: 5,
                        shortText: "2nd & Goal",
                        fieldPositionText: "SF 5",
                        yardLine: 95,
                        yardsToEndzone: 5,
                        redZone: true
                    }
                }),
                createNflGamecastScenario("possession-change", "Gamecast — Possession Change", {
                    possession: { team: "home", providerTeamId: "25" },
                    situation: {
                        down: 2,
                        distance: 1,
                        shortText: "2nd & 1",
                        fieldPositionText: "SF 25",
                        yardLine: 75,
                        yardsToEndzone: 75,
                        redZone: false
                    },
                    drive: { team: "home", plays: 1, yards: 0, elapsed: "0:08" }
                }),
                createNflGamecastScenario("halftime", "Gamecast — Halftime", {
                    score: { away: 17, home: 13 },
                    gameState: { quarter: 2, clock: "HALF", phase: "halftime" },
                    possession: null,
                    situation: null,
                    drive: null,
                    lastPlay: null,
                    lineScore: {
                        periods: [1, 2, 3, 4],
                        away: [7, 10, null, null],
                        home: [3, 10, null, null]
                    }
                }),
                createNflGamecastScenario("overtime", "Gamecast — Overtime", {
                    score: { away: 27, home: 27 },
                    gameState: { quarter: 5, clock: "7:22", phase: "overtime" },
                    possession: { team: "home", providerTeamId: "25" },
                    situation: {
                        down: 1,
                        distance: 10,
                        shortText: "1st & 10",
                        fieldPositionText: "SF 25",
                        yardLine: 75
                    },
                    drive: { team: "home", plays: 3, yards: 18, elapsed: "1:31" },
                    lineScore: {
                        periods: [1, 2, 3, 4, 5],
                        away: [7, 3, 7, 10, 0],
                        home: [3, 7, 7, 10, 0],
                        overtime: { away: 0, home: 0 }
                    }
                }),
                createNflGamecastScenario("long-last-play", "Gamecast — Long Last Play", {
                    lastPlay: {
                        description: "G.Smith scrambles right, reverses field under pressure, then completes a pass to D.Metcalf near the sideline for a first down after an extended review confirmed the catch.",
                        type: "Pass Reception",
                        quarter: 4,
                        clock: "2:48"
                    }
                }),
                createNflGamecastScenario("missing-drive-detail", "Gamecast — Missing Drive Detail", {
                    drive: { elapsed: null }
                }),
                createNflGamecastScenario("final", "Gamecast — Final", {
                    status: "final",
                    score: { away: 30, home: 27 },
                    gameState: { quarter: 5, clock: "0:00", phase: "final" },
                    possession: null,
                    situation: null,
                    drive: null,
                    lastPlay: null,
                    lineScore: {
                        periods: [1, 2, 3, 4, 5],
                        away: [7, 3, 7, 7, 6],
                        home: [3, 7, 7, 10, 0],
                        overtime: { away: 6, home: 0 }
                    }
                })
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
