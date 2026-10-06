export interface SavedCreds {
    androidId: string;
    securityToken: string;
    token: string;
    /** Ids of pushes already seen — replayed-on-reconnect dedupe (push-receiver contract). */
    persistentIds: string[];
}

/**
 * How many recent push ids the creds file keeps.
 *
 * push-receiver sends these ids in the login request (`receivedPersistentId`) so the
 * server acknowledges them and stops redelivering those pushes, and it skips any
 * incoming push whose id it already holds. Only pushes the server has not yet
 * acknowledged can ever be replayed, and this list is re-sent on every connect — the
 * watchdog alone reconnects every few minutes — so an id older than a handful of
 * connects is already acknowledged and can never come back. 100 covers a burst far
 * larger than any chat client receives between two connects.
 */
export const MAX_PERSISTENT_IDS = 100;

/** The ids with `id` added, newest last, trimmed to the most recent `MAX_PERSISTENT_IDS`. */
export const appendPersistentId = (ids: readonly string[], id: string): string[] =>
    ids.includes(id) ? [...ids] : [...ids, id].slice(-MAX_PERSISTENT_IDS);

const readPersistentIds = (raw: unknown): string[] =>
    Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string').slice(-MAX_PERSISTENT_IDS) : [];

/**
 * Parse the creds file. Files from older builds have no `persistentIds`, and one that
 * grew without a cap can be long, so the list is normalized here rather than trusted.
 */
export const parseSavedCreds = (text: string): SavedCreds | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const creds = parsed as Omit<SavedCreds, 'persistentIds'> & { persistentIds?: unknown };
    return { ...creds, persistentIds: readPersistentIds(creds.persistentIds) };
};
