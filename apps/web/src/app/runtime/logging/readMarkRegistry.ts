/**
 * What the room told the server it had read, kept so the channel list can check its own count
 * against it.
 *
 * **Why a module-level record and not state.** The room and the list are different screens: by the
 * time the list draws a count, the room that marked the read is unmounted and its refs are gone.
 * Lifting the value into shared state would put a render-triggering store on a path that nothing
 * renders from — the only reader is a diagnostic comparison (ADR-0075).
 *
 * Session-scoped and deliberately not cleared when a room closes: the divergence being looked for
 * appears AFTER leaving the room. Bounded instead, so a long session that visits many rooms cannot
 * grow it without limit.
 */
export interface IReadMarkRegistry {
    /** Records that `channelId` was marked read up to `chatNo`. Keeps the highest value seen. */
    record(channelId: string, chatNo: number): void;
    /** The highest `chatNo` marked read this session, or `undefined` for a room never marked. */
    markOf(channelId: string): number | undefined;
    /** Drops every entry. Tests only — nothing in the app needs to forget a mark. */
    reset(): void;
}

class ReadMarkRegistry implements IReadMarkRegistry {
    /**
     * Rooms visited in one session. Well above any realistic count, and the eviction below only
     * exists so an unusually long session cannot hold an unbounded map for a diagnostic.
     */
    private static readonly MAX_ENTRIES = 100;

    /** Insertion-ordered by `Map` contract, which is what makes oldest-first eviction possible. */
    private readonly marks = new Map<string, number>();

    record(channelId: string, chatNo: number): void {
        if (!channelId || !Number.isFinite(chatNo)) return;

        const current = this.marks.get(channelId);
        if (current !== undefined && current >= chatNo) return;

        // Re-insert so a room being actively read moves to the back of the eviction order rather
        // than being dropped for rooms opened once and left.
        this.marks.delete(channelId);
        this.marks.set(channelId, chatNo);

        if (this.marks.size > ReadMarkRegistry.MAX_ENTRIES) {
            const oldest = this.marks.keys().next();
            if (!oldest.done) this.marks.delete(oldest.value);
        }
    }

    markOf(channelId: string): number | undefined {
        return this.marks.get(channelId);
    }

    reset(): void {
        this.marks.clear();
    }
}

export const readMarkRegistry: IReadMarkRegistry = new ReadMarkRegistry();
