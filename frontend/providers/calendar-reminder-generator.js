class CalendarReminderGenerator {

    constructor() {
        this.unsubscribe = null;
        this.activeCandidateId = null;
        this.activeEventId = null;
        this.reminderTimer = null;
        this.eventStates = new Map();
        this.checkpoints = [
            { key: "thirtyMinute", minutes: 30 },
            { key: "fifteenMinute", minutes: 15 },
            { key: "fiveMinute", minutes: 5 },
            { key: "start", minutes: 0 }
        ];
    }

    start() {
        this.unsubscribe =
            window.mosaicApp.eventBus.subscribe(
                "calendar-facts",
                (event) => this.evaluate(event.payload)
            );
    }

    evaluate(facts) {
        const event = facts?.status === "available"
            ? facts.nextEvent
            : null;
        const eventId = this.getEventId(event);
        const startTimestamp = Date.parse(event?.start);

        if (
            !eventId ||
            !Number.isFinite(startTimestamp) ||
            startTimestamp < Date.now() - 30 * 1000
        ) {
            this.clearReminderTimer();
            this.withdrawActiveCandidate();
            this.activeEventId = null;
            return;
        }

        if (
            this.activeEventId &&
            this.activeEventId !== eventId
        ) {
            this.clearReminderTimer();
            this.withdrawActiveCandidate();
        }

        this.activeEventId = eventId;
        const state = this.getEventState(
            eventId,
            event,
            startTimestamp
        );

        this.scheduleNextCheckpoint(state);
    }

    getEventId(event) {
        if (!event?.title || !event.start) return null;

        return encodeURIComponent(
            `${event.start}|${event.title}`
        );
    }

    getEventState(eventId, event, startTimestamp) {
        if (!this.eventStates.has(eventId)) {
            this.eventStates.set(eventId, {
                eventId,
                event,
                startTimestamp,
                sent: {
                    thirtyMinute: false,
                    fifteenMinute: false,
                    fiveMinute: false,
                    start: false
                }
            });
        }

        const state = this.eventStates.get(eventId);
        state.event = event;
        state.startTimestamp = startTimestamp;

        return state;
    }

    scheduleNextCheckpoint(state) {
        this.clearReminderTimer();

        const now = Date.now();
        const checkpoint = this.checkpoints.find((item) => {
            if (state.sent[item.key]) return false;

            const checkpointTime =
                state.startTimestamp - item.minutes * 60 * 1000;

            if (checkpointTime < now) {
                // The generator began after this checkpoint; do not replay it.
                state.sent[item.key] = true;
                return false;
            }

            return true;
        });

        if (!checkpoint) return;

        const checkpointTime =
            state.startTimestamp - checkpoint.minutes * 60 * 1000;
        const delay = Math.max(checkpointTime - now, 0);

        this.reminderTimer = setTimeout(() => {
            this.reminderTimer = null;

            if (
                this.activeEventId !== state.eventId ||
                state.sent[checkpoint.key]
            ) {
                return;
            }

            state.sent[checkpoint.key] = true;
            this.publishCheckpoint(state, checkpoint);
            this.scheduleNextCheckpoint(state);
        }, delay);
    }

    publishCheckpoint(state, checkpoint) {
        const createdAt = new Date();
        const candidateId =
            `calendar:reminder:${state.eventId}`;

        window.mosaicApp.eventBus.publish({
            type: "hero-candidate",
            source: "calendar",
            payload: {
                candidate: {
                    id: candidateId,
                    source: "calendar",
                    type: "calendar.reminder",
                    mode: "interrupt",
                    priority: 90,
                    headline: state.event.title,
                    summary: this.formatReminderMessage(checkpoint),
                    behavior: {
                        sticky: false,
                        durationSeconds: 30
                    },
                    createdAt: createdAt.toISOString(),
                    expiresAt: new Date(
                        createdAt.getTime() + 30 * 1000
                    ).toISOString()
                }
            }
        });
        this.activeCandidateId = candidateId;
    }

    getReminderCheckpoint(minutesUntilEvent) {
        return this.checkpoints.find(
            (checkpoint) =>
                checkpoint.minutes === minutesUntilEvent
        ) || null;
    }

    formatReminderMessage(checkpoint) {
        if (checkpoint.key === "start") {
            return "Starting now.";
        }

        return `Starts in ${checkpoint.minutes} minutes.`;
    }

    clearReminderTimer() {
        if (!this.reminderTimer) return;

        clearTimeout(this.reminderTimer);
        this.reminderTimer = null;
    }

    withdrawActiveCandidate() {
        if (!this.activeCandidateId) return;

        window.mosaicApp.eventBus.publish({
            type: "hero-candidate-withdraw",
            source: "calendar",
            payload: {
                id: this.activeCandidateId
            }
        });
        this.activeCandidateId = null;
    }

}
