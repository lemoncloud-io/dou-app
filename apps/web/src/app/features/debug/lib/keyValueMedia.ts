/**
 * The Storage screen's key browser: every key this run keeps in a key-value medium, read and written
 * through the store objects the app itself uses.
 *
 * The objects come from `activeStorage` — the set `resolveStorageStores()` built in `main.tsx`. Writing
 * through them, rather than through `window.localStorage` or a fresh vault channel, is what makes an
 * edit land where the app reads: the vault in particular is a memory copy the app reads synchronously,
 * and only its own `set` both updates that copy and sends the write to the shell.
 */

import type { KeyValueStore } from '@chatic/storage';

import {
    describeStoreRoles,
    type ActiveStores,
    type StorageMedium,
    type StorageRole,
} from '../../../runtime/activeStorage';
import { classifyWebKey, type WebKeyGroup } from './webStorage';

/** Why a medium shows no keys although the run has it. */
export type MediumBlocked =
    /** The shell owns the session this launch; the page never opened its vault. */
    | 'nativeOwned'
    /** The shell could not read the vault this run; its writes go to the tab store instead. */
    | 'unavailable';

export interface KeyValueMedium {
    medium: StorageMedium;
    /** The roles this medium plays this run, e.g. `secret` + `plain` for a plain tab's sessionStorage. */
    roles: StorageRole[];
    store: KeyValueStore;
    blocked?: MediumBlocked;
}

export interface KeyValueEntry {
    /** `medium` + key — unique across the list. */
    id: string;
    medium: StorageMedium;
    key: string;
    value: string;
    /** What part of the app the key belongs to (session, config, logs, other). */
    group: WebKeyGroup;
    /** Key + value length, the same measure as the clear section's sizes. */
    bytes: number;
}

const ORDER: readonly StorageMedium[] = ['vault', 'localStorage', 'sessionStorage'];

/**
 * The media this run actually keeps state in, with the roles each plays. The vault is listed only when
 * the set has one; when the shell owns the session or could not read the vault it is listed as blocked
 * rather than left out, because "the tokens are not here" is the answer the reader came for.
 */
export const activeKeyValueMedia = (
    active: ActiveStores,
    sessionOwner: 'web' | 'native' | undefined
): KeyValueMedium[] => {
    const roles = describeStoreRoles(active);
    const rolesOf = (medium: StorageMedium) =>
        (Object.keys(roles) as StorageRole[]).filter(role => roles[role] === medium);
    const stores: Record<StorageMedium, KeyValueStore | null> = {
        vault: active.vault,
        localStorage: active.webLocal,
        sessionStorage: active.webSession,
    };
    return ORDER.flatMap(medium => {
        const store = stores[medium];
        if (!store) return [];
        const entry: KeyValueMedium = { medium, roles: rolesOf(medium), store };
        if (medium === 'vault' && active.vault) {
            if (sessionOwner === 'native') entry.blocked = 'nativeOwned';
            else if (active.vault.status === 'unavailable') entry.blocked = 'unavailable';
        }
        return [entry];
    });
};

/** Every key of every unblocked medium, sorted by medium then key. A store that throws on read is skipped. */
export const readKeyValueEntries = (media: readonly KeyValueMedium[]): KeyValueEntry[] =>
    media.flatMap(({ medium, store, blocked }) => {
        if (blocked) return [];
        let keys: string[];
        try {
            keys = store.keys();
        } catch {
            return [];
        }
        return [...keys].sort().map(key => {
            const value = store.get(key) ?? '';
            return {
                id: `${medium}:${key}`,
                medium,
                key,
                value,
                group: classifyWebKey(key),
                bytes: key.length + value.length,
            };
        });
    });

/** A value for the editor: pretty-printed when it is a JSON object or array, as stored otherwise. */
export const formatValueForEdit = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
    try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
        return value;
    }
};

/**
 * The text to store for what the editor holds. JSON goes back compact, the way the app writes it, so
 * the indentation the editor added is not left in the store; anything else is stored exactly as typed.
 */
export const valueToStore = (edited: string): string => {
    const trimmed = edited.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return edited;
    try {
        return JSON.stringify(JSON.parse(trimmed));
    } catch {
        return edited;
    }
};
