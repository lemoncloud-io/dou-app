export interface SavedCreds {
    androidId: string;
    securityToken: string;
    token: string;
    persistentIds: string[];
}

export const MAX_PERSISTENT_IDS = 100;

export const appendPersistentId = (ids: readonly string[], id: string): string[] =>
    ids.includes(id) ? [...ids] : [...ids, id].slice(-MAX_PERSISTENT_IDS);

const readPersistentIds = (raw: unknown): string[] =>
    Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string').slice(-MAX_PERSISTENT_IDS) : [];

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
