import { attachLogPersistence, serializeLogs } from '@chatic/bridges';
import type { LogEntry, LogPersistence } from '@chatic/bridges';

const LOG_QUEUE_STORAGE_KEY = '@chatic/web.log.queue';
const ALIVE_SENTINEL_KEY = '@chatic/web.log.alive';

/**
 * sessionStorage adapter for the core LogPersistence port (ADR-0047).
 * Tab-scoped by design: entries survive reloads (crash-reload included) but
 * die with the tab, so multi-tab logs never interleave and unredacted logs
 * (ADR-0017 v1) never linger on the device.
 */
export class SessionStorageLogPersistence implements LogPersistence {
    load(): LogEntry[] {
        const raw = sessionStorage.getItem(LOG_QUEUE_STORAGE_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw) as Partial<LogEntry>[];
            if (!Array.isArray(parsed)) return [];
            return parsed.map(item => ({
                level: item.level ?? 'info',
                tag: item.tag ?? 'APP',
                message: item.message ?? '',
                timestamp: item.timestamp ?? 0,
                ...(item.data !== undefined ? { data: item.data } : {}),
                ...(item.error !== undefined ? { error: item.error } : {}),
                ...(item.source !== undefined ? { source: item.source } : {}),
            }));
        } catch {
            return [];
        }
    }

    save(entries: LogEntry[]): void {
        // serializeLogs applies the shared caps (2k per field, 40k total,
        // oldest dropped first) and flattens circular payloads. Without them a
        // single oversized `data` would be re-stringified on every error-level
        // flush and could exhaust the ~5MB sessionStorage quota — after which
        // every later save throws and persistence silently stops.
        // Quota errors still propagate; the core listener swallows them so
        // logging never breaks.
        sessionStorage.setItem(LOG_QUEUE_STORAGE_KEY, JSON.stringify(serializeLogs(entries)));
    }
}

export interface WebLogBootResult {
    /**
     * True when the previous session in this tab ended WITHOUT a clean
     * pagehide — the page crashed, hung, or was killed (ADR-0047 S7).
     */
    crashedLastSession: boolean;
    /** The previous session's persisted entries (crash-report breadcrumbs). */
    previousEntries: LogEntry[];
    /** Detaches persistence and the sentinel lifecycle (tests). */
    teardown: () => void;
}

/**
 * Boots web log persistence: reads the previous session's fate (alive
 * sentinel + persisted queue), then starts persisting the current session's
 * buffer. Previous entries are NOT restored into the live buffer — they
 * belong to the page-crash report, not to the new session's breadcrumbs.
 */
export const attachWebLogPersistence = (): WebLogBootResult => {
    let crashedLastSession = false;
    let previousEntries: LogEntry[] = [];
    const persistence = new SessionStorageLogPersistence();

    try {
        crashedLastSession = sessionStorage.getItem(ALIVE_SENTINEL_KEY) === '1';
        previousEntries = persistence.load();
    } catch {
        /* storage unavailable: run memory-only */
    }

    const detachPersistence = attachLogPersistence(persistence);

    // The sentinel is set while this session is alive and in the foreground;
    // a session that dies with it still set is read as a crash on next boot.
    //
    // `pagehide` alone is not enough: a backgrounded tab discarded by the OS
    // (common on mobile) never fires it, and the next visit would report a
    // false page-crash. Since false crash reports are exactly the noise
    // ADR-0029 set out to remove, the sentinel is also cleared whenever the
    // page goes hidden and re-armed when it comes back. The trade-off is
    // deliberate: a crash that happens while hidden goes unreported, which
    // costs far less than eroding trust in the signal.
    const setAlive = (): void => {
        try {
            sessionStorage.setItem(ALIVE_SENTINEL_KEY, '1');
        } catch {
            /* noop */
        }
    };
    const clearAlive = (): void => {
        try {
            sessionStorage.removeItem(ALIVE_SENTINEL_KEY);
        } catch {
            /* noop */
        }
    };
    const onVisibilityChange = (): void => {
        if (document.visibilityState === 'hidden') clearAlive();
        else setAlive();
    };

    setAlive();
    window.addEventListener('pagehide', clearAlive);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return {
        crashedLastSession,
        previousEntries,
        teardown: () => {
            detachPersistence();
            window.removeEventListener('pagehide', clearAlive);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            clearAlive();
        },
    };
};
