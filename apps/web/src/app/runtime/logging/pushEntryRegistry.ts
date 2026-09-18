/** One in-flight "the user tapped a push, a room should open" hand-off. */
export interface PendingPushEntry {
    /** The sender's push id — the correlation key the receipt entry also carries. */
    messageId?: string;
    /** Milliseconds between the tap and the room reading this record. */
    elapsedMs: number;
}

/**
 * Carries a tapped push from the tap to the room it opens, so the room's entry can be logged under
 * the same correlation key as its receipt (ADR-0099).
 *
 * **Why this exists at all.** "Tapped a push, the conversation was slow or never appeared" is
 * unanswerable from either side alone — the tap knows which push it was, the room knows when it
 * finally drew messages, and nothing connects them. Threading the id through navigation state would
 * put a diagnostic field into the router contract every screen shares; a single-slot hand-off keeps
 * it out of everything that is not this measurement.
 *
 * **Only push-originated entries are recorded.** Rooms are opened constantly; logging every mount
 * would spend the device's log budget on ordinary navigation. A room reached any other way finds
 * nothing here and stays silent.
 */
export interface IPushEntryRegistry {
    /** Records that a push for `channelId` was tapped. Replaces any earlier pending entry. */
    begin(channelId: string, messageId?: string): void;
    /**
     * Takes the pending entry for `channelId`, if one is still fresh, and clears it. Returns
     * `undefined` for a room that was not reached from a push, or for a hand-off that went stale.
     */
    consume(channelId: string): PendingPushEntry | undefined;
    /** Drops the pending entry. Tests only. */
    reset(): void;
}

class PushEntryRegistry implements IPushEntryRegistry {
    /**
     * A tap that has not reached its room within this window did not reach it at all — the user
     * navigated elsewhere, or the route was dropped. Attributing it to whatever room opens later
     * would invent a latency measurement out of an unrelated visit.
     */
    private static readonly TTL_MS = 30_000;

    private pending: { channelId: string; messageId?: string; at: number } | null = null;

    begin(channelId: string, messageId?: string): void {
        if (!channelId) return;
        this.pending = { channelId, messageId, at: Date.now() };
    }

    consume(channelId: string): PendingPushEntry | undefined {
        const pending = this.pending;
        if (!pending || pending.channelId !== channelId) return undefined;

        this.pending = null;
        const elapsedMs = Date.now() - pending.at;
        if (elapsedMs > PushEntryRegistry.TTL_MS) return undefined;
        return { messageId: pending.messageId, elapsedMs };
    }

    reset(): void {
        this.pending = null;
    }
}

export const pushEntryRegistry: IPushEntryRegistry = new PushEntryRegistry();
