class CalendarReminderGenerator {

    constructor() {
        this.unsubscribe = null;
        this.activeCandidateId = null;
    }

    start() {
        this.unsubscribe =
            window.mosaicApp.eventBus.subscribe(
                "calendar-facts",
                (event) => this.evaluate(event.payload)
            );
    }

    evaluate(facts) {
        const candidate = this.createReminderCandidate(facts);

        if (!candidate) {
            this.withdrawActiveCandidate();
            return;
        }

        if (
            this.activeCandidateId &&
            this.activeCandidateId !== candidate.id
        ) {
            this.publishWithdrawal(this.activeCandidateId);
        }

        window.mosaicApp.eventBus.publish({
            type: "hero-candidate",
            source: "calendar",
            payload: {
                candidate
            }
        });
        this.activeCandidateId = candidate.id;
    }

    createReminderCandidate(facts) {
        const event = facts?.status === "available"
            ? facts.nextEvent
            : null;
        const startTimestamp = Date.parse(event?.start);
        const now = Date.now();
        const millisecondsUntilStart = startTimestamp - now;
        const reminderWindow = 30 * 60 * 1000;

        if (
            !event?.title ||
            !Number.isFinite(startTimestamp) ||
            millisecondsUntilStart <= 0 ||
            millisecondsUntilStart > reminderWindow
        ) {
            return null;
        }

        const minutesUntilStart = Math.ceil(
            millisecondsUntilStart / (60 * 1000)
        );
        const createdAt = new Date(now);
        const eventIdentifier = encodeURIComponent(
            `${event.start}|${event.title}`
        );

        return {
            id: `calendar:reminder:${eventIdentifier}`,
            source: "calendar",
            type: "calendar.reminder",
            mode: "interrupt",
            priority: 90,
            headline: event.title,
            summary:
                `Starts in ${minutesUntilStart} ` +
                `${minutesUntilStart === 1 ? "minute" : "minutes"}.`,
            behavior: {
                sticky: false,
                durationSeconds: 30
            },
            createdAt: createdAt.toISOString(),
            expiresAt: new Date(
                createdAt.getTime() + 30 * 1000
            ).toISOString()
        };
    }

    withdrawActiveCandidate() {
        if (!this.activeCandidateId) return;

        this.publishWithdrawal(this.activeCandidateId);
        this.activeCandidateId = null;
    }

    publishWithdrawal(id) {
        window.mosaicApp.eventBus.publish({
            type: "hero-candidate-withdraw",
            source: "calendar",
            payload: {
                id
            }
        });
    }

}
