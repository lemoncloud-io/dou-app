import { toWireLogEntry } from '@chatic/bridges';

import type { LogEntry, LogLevel } from '@chatic/bridges';

import { deviceStore, tabStore } from '../../storage';

export const LOG_KEY_PREFIX = '@chatic/web.log.';

const KEY_PREFIX = `${LOG_KEY_PREFIX}pending.`;
const HEARTBEAT_PREFIX = '@chatic/web.log.pending.alive.';

export const ORPHAN_AFTER_MS = 60_000;
export const HEARTBEAT_INTERVAL_MS = 15_000;

const toEntry = (raw: Partial<LogEntry>): LogEntry => ({
    ...raw,
    level: (raw.level ?? 'info') as LogLevel,
    tag: raw.tag ?? 'APP',
    message: raw.message ?? '',
    timestamp: raw.timestamp ?? 0,
});

const readJson = (key: string): LogEntry[] => {
    try {
        const raw = deviceStore.get(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as Partial<LogEntry>[]).map(toEntry) : [];
    } catch {
        return [];
    }
};

const TAB_ID_KEY = '@chatic/web.log.pending.tab';

export const resolveTabId = (fallback: string): string => {
    const existing = tabStore.get(TAB_ID_KEY);
    if (existing) return existing;
    tabStore.set(TAB_ID_KEY, fallback);
    return fallback;
};

const safeRemove = (key: string): void => deviceStore.remove(key);

export interface LogUploadStore {
    load(): LogEntry[];
    save(entries: LogEntry[]): void;
    start(): () => void;
}

export const createLogUploadStore = (tabId: string): LogUploadStore => {
    const key = `${KEY_PREFIX}${tabId}`;
    const heartbeatKey = `${HEARTBEAT_PREFIX}${tabId}`;

    const beat = (): void => {
        deviceStore.set(heartbeatKey, String(Date.now()));
    };

    const adoptOrphans = (): LogEntry[] => {
        const adopted: LogEntry[] = [];

        try {
            const now = Date.now();
            const dataKeys: string[] = [];
            const heartbeatKeys: string[] = [];

            for (const candidate of deviceStore.keys()) {
                if (!candidate.startsWith(KEY_PREFIX)) continue;
                if (candidate === key || candidate === heartbeatKey || candidate === TAB_ID_KEY) continue;

                if (candidate.startsWith(HEARTBEAT_PREFIX)) heartbeatKeys.push(candidate);
                else dataKeys.push(candidate);
            }

            const isStale = (owner: string): boolean =>
                now - Number(deviceStore.get(`${HEARTBEAT_PREFIX}${owner}`) ?? 0) >= ORPHAN_AFTER_MS;

            dataKeys.forEach(dataKey => {
                const owner = dataKey.slice(KEY_PREFIX.length);
                if (!isStale(owner)) return;

                adopted.push(...readJson(dataKey));
                safeRemove(dataKey);
                safeRemove(`${HEARTBEAT_PREFIX}${owner}`);
            });

            heartbeatKeys.forEach(beatKey => {
                const owner = beatKey.slice(HEARTBEAT_PREFIX.length);
                if (!isStale(owner)) return;
                if (deviceStore.get(`${KEY_PREFIX}${owner}`)) return;
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

            return [...own, ...adopted].sort((a, b) => a.timestamp - b.timestamp);
        },

        save(entries) {
            try {
                if (!entries.length) {
                    deviceStore.remove(key);
                    return;
                }
                deviceStore.set(key, JSON.stringify(entries.map(toWireLogEntry)));
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
