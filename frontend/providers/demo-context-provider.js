/*
 * Temporary development infrastructure for exercising Hero context modes.
 * Remove this provider when real active and interrupt generators are ready.
 */
class DemoContextProvider {

    constructor() {
        this.candidateIds = [
            "demo:resting",
            "demo:active",
            "demo:interrupt"
        ];
    }

    start() {
        window.mosaicDemo = window.mosaicDemo || {};
        window.mosaicDemo.hero = {
            resting: () => this.publishCandidate({
                id: "demo:resting",
                source: "demo",
                type: "demo.resting",
                mode: "resting",
                priority: 10,
                behavior: {
                    sticky: false,
                    durationSeconds: null
                },
                headline: "Clear evening ahead",
                summary: "72° with calm conditions"
            }),
            active: () => this.publishCandidate({
                id: "demo:active",
                source: "demo",
                type: "demo.active",
                mode: "active",
                priority: 50,
                behavior: {
                    sticky: true,
                    durationSeconds: null
                },
                headline: "Mariners Live",
                summary: "SEA 3 - LAA 2 | Bottom 7th"
            }),
            interrupt: () => this.publishCandidate({
                id: "demo:interrupt",
                source: "demo",
                type: "demo.interrupt",
                mode: "interrupt",
                priority: 90,
                behavior: {
                    sticky: false,
                    durationSeconds: 30
                },
                headline: "Meeting in 5 minutes",
                summary: "Operations Review"
            }),
            clear: () => this.clearCandidates()
        };
    }

    publishCandidate(candidate) {
        window.mosaicApp.eventBus.publish({
            type: "hero-candidate",
            source: "demo",
            payload: {
                candidate
            }
        });
    }

    clearCandidates() {
        this.candidateIds.forEach((id) => {
            window.mosaicApp.eventBus.publish({
                type: "hero-candidate-withdraw",
                source: "demo",
                payload: {
                    id
                }
            });
        });
    }

}
