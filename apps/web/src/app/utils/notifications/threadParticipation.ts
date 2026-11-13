/**
 * The threads this device has seen the reader take part in — the root is theirs, or they replied.
 * The server keeps no such list and a root carries no reply aggregate, so the inbox builds it from
 * what passes through this device; it is only as complete as that.
 */
export interface ThreadParticipation {
    /**
     * Whether the root is the reader's. Unknown (absent) until the root has been read — a thread
     * learnt from a reply of mine says nothing about who wrote its root.
     */
    rootMine?: boolean;
    /** The root as one line, kept with `rootMine` — an item's quote. */
    rootPreview?: string;
    /** Epoch ms of the newest activity seen — eviction order. */
    lastAt: number;
}

export type ThreadParticipations = Record<string, ThreadParticipation>;

/** The most threads remembered; the least recently active go first. */
export const THREAD_PARTICIPATIONS_MAX = 300;

const evict = (threads: ThreadParticipations): ThreadParticipations => {
    const keys = Object.keys(threads);
    if (keys.length <= THREAD_PARTICIPATIONS_MAX) return threads;
    const oldestFirst = keys.sort((a, b) => threads[a].lastAt - threads[b].lastAt);
    const next = { ...threads };
    for (const key of oldestFirst.slice(0, keys.length - THREAD_PARTICIPATIONS_MAX)) delete next[key];
    return next;
};

/**
 * Records that the reader takes part in a thread, merging what is newly known about its root. Hands
 * back `threads` itself when nothing changes, so the store writes nothing.
 */
export const rememberThread = (
    threads: ThreadParticipations,
    key: string,
    patch: Pick<ThreadParticipation, 'rootMine' | 'rootPreview'>,
    at: number
): ThreadParticipations => {
    const held = threads[key];
    const next: ThreadParticipation = {
        rootMine: patch.rootMine ?? held?.rootMine,
        rootPreview: patch.rootPreview ?? held?.rootPreview,
        lastAt: Math.max(held?.lastAt ?? 0, at),
    };
    if (
        held &&
        held.rootMine === next.rootMine &&
        held.rootPreview === next.rootPreview &&
        held.lastAt === next.lastAt
    ) {
        return threads;
    }
    return evict({ ...threads, [key]: next });
};
