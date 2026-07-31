// Locally-remembered relay invite declines.
//
// TODO(backend): 2번 — ADR-0033 인터페이스 선반영. There is no reject API and no `rejected` invite
// state, so declining is a client-only event: we close the popup and remember the invite here, which
// is enough to keep the popup from ambushing the user every time the same deeplink is re-opened.
// When the API lands this module becomes a cache in front of it (or goes away).
//
// Stores the invite ID, never the code: the code is a credential (05-client-guide §B-1) and must not
// be written to storage, logs, or URLs other than the deeplink itself.

const STORAGE_KEY = 'chatic-web-relay-invite-declined';
/** Cap the ring so a long-lived install cannot grow the entry without bound. Oldest drops first. */
const MAX_ENTRIES = 50;

// Minimal storage surface so tests can inject a fake without a DOM (mirrors cloudUnreadSnapshot).
export interface DeclineStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const resolveStorage = (storage?: DeclineStorage): DeclineStorage | null =>
    storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);

const readAll = (storage?: DeclineStorage): string[] => {
    const store = resolveStorage(storage);
    if (!store) return [];
    try {
        const parsed = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
        return [];
    }
};

/** Remember that this invite was declined. No-op without an id (nothing safe to key on). */
export const recordDeclinedInvite = (inviteId: string | undefined, storage?: DeclineStorage): void => {
    if (!inviteId) return;
    const store = resolveStorage(storage);
    if (!store) return;

    const next = [...readAll(storage).filter(id => id !== inviteId), inviteId].slice(-MAX_ENTRIES);
    try {
        store.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // best-effort: a full/blocked storage just means the decline is not remembered
    }
};

/** Whether this invite was declined on this device. */
export const isInviteDeclined = (inviteId: string | undefined, storage?: DeclineStorage): boolean =>
    !!inviteId && readAll(storage).includes(inviteId);
