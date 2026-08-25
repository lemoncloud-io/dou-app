import { toWireLogEntry } from '@chatic/bridges';

import type { LogEntry, LogLevel } from '@chatic/bridges';

/**
 * Persistence for the unsent upload queue.
 *
 * localStorage, not sessionStorage: this queue's whole purpose is to survive.
 * sessionStorage dies with the tab, which would make "logs from a few days ago
 * arrive on the next launch" — the behavior the collector was told to expect —
 * simply false. IndexedDB would hold more but is asynchronous, and the moments
 * that matter most here (pagehide, backgrounding) are exactly when an async
 * write is least likely to finish.
 *
 * Keys are per-tab so two tabs never read-modify-write the same record. The
 * cost is that a closed tab leaves its queue behind, so each tab keeps a
 * heartbeat and a booting tab adopts any queue whose heartbeat has gone stale.
 *
 * The tab's identity lives in sessionStorage, which is exactly tab-scoped:
 * it survives reloads within the tab and dies with it. Minting a fresh id per
 * page load instead would leak a new pair of keys on every refresh and orphan
 * the queue the previous load was still holding.
 *
 * Entries are flattened through the wire mapper before they are written, which
 * is what applies masking and the per-field size cap. Writing raw entries would
 * put unredacted payloads on disk — a failed request's log carries the live
 * axios error, whose `config` holds auth headers and the request body — where
 * any script on the origin can read them. It also keeps one circular `data`
 * from throwing on every save and silently ending persistence, and bounds what
 * the queue can do to the ~5MB origin quota it shares with session tokens.
 */

const KEY_PREFIX = '@chatic/web.log.pending.';
const HEARTBEAT_PREFIX = '@chatic/web.log.pending.alive.';

/** A queue whose tab has not checked in for this long is considered orphaned. */
export const ORPHAN_AFTER_MS = 60_000;
/** How often the owning tab refreshes its heartbeat. */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/** Restores a persisted record; `data`/`error` stay strings, which the mapper passes through. */
const toEntry = (raw: Partial<LogEntry>): LogEntry => ({
    ...raw,
    level: (raw.level ?? 'info') as LogLevel,
    tag: raw.tag ?? 'APP',
    message: raw.message ?? '',
    timestamp: raw.timestamp ?? 0,
});

const readJson = (key: string): LogEntry[] => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as Partial<LogEntry>[]).map(toEntry) : [];
    } catch {
        return [];
    }
};

const TAB_ID_KEY = '@chatic/web.log.pending.tab';

/**
 * Stable id for this browser tab, reused across reloads.
 *
 * Falls back to a caller-supplied value when sessionStorage is unavailable —
 * that run simply behaves like a fresh tab each load.
 */
export const resolveTabId = (fallback: string): string => {
    try {
        const existing = sessionStorage.getItem(TAB_ID_KEY);
        if (existing) return existing;
        sessionStorage.setItem(TAB_ID_KEY, fallback);
        return fallback;
    } catch {
        return fallback;
    }
};

const safeRemove = (key: string): void => {
    try {
        localStorage.removeItem(key);
    } catch {
        /* storage unavailable — nothing to clean up */
    }
};

export interface LogUploadStore {
    /** Entries this tab still owns, plus anything adopted from dead tabs. */
    load(): LogEntry[];
    save(entries: LogEntry[]): void;
    /** Starts the heartbeat; returns a teardown that clears this tab's marks. */
    start(): () => void;
}

export const createLogUploadStore = (tabId: string): LogUploadStore => {
    const key = `${KEY_PREFIX}${tabId}`;
    const heartbeatKey = `${HEARTBEAT_PREFIX}${tabId}`;

    const beat = (): void => {
        try {
            localStorage.setItem(heartbeatKey, String(Date.now()));
        } catch {
            /* quota or private mode — the queue still works in memory */
        }
    };

    /**
     * Collects queues left behind by tabs that are gone. A stale heartbeat is
     * the signal; a queue with no heartbeat at all is stale by definition.
     */
    const adoptOrphans = (): LogEntry[] => {
        const adopted: LogEntry[] = [];

        try {
            const now = Date.now();
            const dataKeys: string[] = [];
            const heartbeatKeys: string[] = [];

            for (let i = 0; i < localStorage.length; i += 1) {
                const candidate = localStorage.key(i);
                if (!candidate?.startsWith(KEY_PREFIX)) continue;
                if (candidate === key || candidate === heartbeatKey || candidate === TAB_ID_KEY) continue;

                if (candidate.startsWith(HEARTBEAT_PREFIX)) heartbeatKeys.push(candidate);
                else dataKeys.push(candidate);
            }

            const isStale = (owner: string): boolean =>
                now - Number(localStorage.getItem(`${HEARTBEAT_PREFIX}${owner}`) ?? 0) >= ORPHAN_AFTER_MS;

            dataKeys.forEach(dataKey => {
                const owner = dataKey.slice(KEY_PREFIX.length);
                if (!isStale(owner)) return;

                adopted.push(...readJson(dataKey));
                safeRemove(dataKey);
                safeRemove(`${HEARTBEAT_PREFIX}${owner}`);
            });

            // Sweep heartbeats whose queue is already gone. A tab that emptied
            // its queue and then closed leaves one behind, and nothing else
            // would ever remove it — they would accumulate for the life of the
            // origin.
            heartbeatKeys.forEach(beatKey => {
                const owner = beatKey.slice(HEARTBEAT_PREFIX.length);
                if (!isStale(owner)) return;
                if (localStorage.getItem(`${KEY_PREFIX}${owner}`)) return;
                safeRemove(beatKey);
            });
        } catch {
            /* enumeration failed — carry on with just this tab's queue */
        }

        return adopted;
    };

    return {
        load() {
            const own = readJson(key);
            const adopted = adoptOrphans();
            if (!adopted.length) return own;

            // Chronological across both sources so drop-oldest stays meaningful.
            return [...own, ...adopted].sort((a, b) => a.timestamp - b.timestamp);
        },

        save(entries) {
            try {
                if (!entries.length) {
                    localStorage.removeItem(key);
                    return;
                }
                localStorage.setItem(key, JSON.stringify(entries.map(toWireLogEntry)));
            } catch {
                // Quota exhaustion must never break logging. The queue keeps
                // running in memory and its own cap does the trimming.
            }
        },

        start() {
            beat();
            const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);

            return () => {
                clearInterval(timer);
                safeRemove(heartbeatKey);
            };
        },
    };
};
