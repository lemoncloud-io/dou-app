import type { KeyValueStore } from '@chatic/storage';

import {
    describeStoreRoles,
    type ActiveStores,
    type StorageMedium,
    type StorageRole,
} from '../../../runtime/activeStorage';
import { classifyWebKey, type WebKeyGroup } from './webStorage';

export type MediumBlocked = 'nativeOwned' | 'unavailable';

export interface KeyValueMedium {
    medium: StorageMedium;
    roles: StorageRole[];
    store: KeyValueStore;
    blocked?: MediumBlocked;
}

export interface KeyValueEntry {
    id: string;
    medium: StorageMedium;
    key: string;
    value: string;
    group: WebKeyGroup;
    bytes: number;
}

const ORDER: readonly StorageMedium[] = ['vault', 'localStorage', 'sessionStorage'];

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

export const formatValueForEdit = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
    try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
        return value;
    }
};

export const valueToStore = (edited: string): string => {
    const trimmed = edited.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return edited;
    try {
        return JSON.stringify(JSON.parse(trimmed));
    } catch {
        return edited;
    }
};
