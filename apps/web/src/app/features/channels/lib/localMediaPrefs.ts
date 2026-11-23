import { useSyncExternalStore } from 'react';

import { chatMediaEntries, type DomainChat } from '@chatic/runtime';
import type { KeyValueStore } from '@chatic/storage';

import { deviceStore } from '../../../storage';

export interface MediaScope {
    cid: string;
    uid: string;
}

export const hiddenMediaKey = (channelId: string, chatNo: number, idx: number): string =>
    `${channelId}:${chatNo}:${idx}`;

export const hiddenPartsOf = (
    message: DomainChat,
    hidden: ReadonlySet<string> | undefined
): { slots: ReadonlySet<number>; links: ReadonlySet<string> } | undefined => {
    if (!hidden?.size || !message.chatNo || !message.channelId) return undefined;
    const entries = chatMediaEntries(message).filter(entry =>
        hidden.has(hiddenMediaKey(message.channelId, message.chatNo, entry.idx))
    );
    if (entries.length === 0) return undefined;
    return {
        slots: new Set(entries.filter(entry => entry.kind !== 'link').map(entry => entry.idx)),
        links: new Set(entries.filter(entry => entry.kind === 'link').map(entry => entry.ref)),
    };
};

const HIDDEN_PREFIX = 'dou.hiddenMedia';
const WAVEFORM_PREFIX = 'dou.waveforms';
export const WAVEFORM_CACHE_MAX = 500;

const scopeKey = (prefix: string, scope: MediaScope) => `${prefix}:${scope.cid}:${scope.uid}`;

let storage: KeyValueStore = deviceStore;
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
    version += 1;
    listeners.forEach(listener => listener());
};

const readJson = <T>(key: string): T | undefined => {
    try {
        const raw = storage.get(key);
        return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
        return undefined;
    }
};

const writeJson = (key: string, value: unknown): void => {
    try {
        storage.set(key, JSON.stringify(value));
    } catch {
        // A full or blocked store: the change lives until the page reloads, which is the best on offer.
    }
};

const hiddenCache = new Map<string, { version: number; set: ReadonlySet<string> }>();

export const readHiddenMedia = (scope: MediaScope): ReadonlySet<string> => {
    const key = scopeKey(HIDDEN_PREFIX, scope);
    const cached = hiddenCache.get(key);
    if (cached && cached.version === version) return cached.set;
    const list = readJson<unknown>(key);
    const set = new Set(Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : []);
    hiddenCache.set(key, { version, set });
    return set;
};

export const hideMedia = (scope: MediaScope, keys: readonly string[]): void => {
    if (keys.length === 0) return;
    const next = new Set(readHiddenMedia(scope));
    keys.forEach(key => next.add(key));
    writeJson(scopeKey(HIDDEN_PREFIX, scope), [...next]);
    changed();
};

export const unhideMedia = (scope: MediaScope, keys: readonly string[]): void => {
    const next = new Set(readHiddenMedia(scope));
    keys.forEach(key => next.delete(key));
    writeJson(scopeKey(HIDDEN_PREFIX, scope), [...next]);
    changed();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
};

const EMPTY: ReadonlySet<string> = new Set();

export const useHiddenMedia = (scope: MediaScope | undefined): ReadonlySet<string> =>
    useSyncExternalStore(
        subscribe,
        () => (scope?.cid && scope.uid ? readHiddenMedia(scope) : EMPTY),
        () => EMPTY
    );

export type StoredWaveform = readonly number[] | 'decorative';

interface WaveformEntries {
    order: string[];
    bars: Record<string, StoredWaveform>;
}

const readWaveforms = (scope: MediaScope): WaveformEntries => {
    const value = readJson<Partial<WaveformEntries>>(scopeKey(WAVEFORM_PREFIX, scope));
    const order = Array.isArray(value?.order) ? value.order.filter(id => typeof id === 'string') : [];
    const bars = value?.bars && typeof value.bars === 'object' ? value.bars : {};
    return { order: order.filter(id => id in bars), bars };
};

const validWaveform = (value: unknown): value is StoredWaveform =>
    value === 'decorative' ||
    (Array.isArray(value) && value.every(bar => typeof bar === 'number' && bar >= 0 && bar <= 1));

export const readWaveform = (scope: MediaScope, uploadId: string): StoredWaveform | undefined => {
    const entries = readWaveforms(scope);
    const found = entries.bars[uploadId];
    if (!validWaveform(found)) return undefined;
    entries.order = [...entries.order.filter(id => id !== uploadId), uploadId];
    writeJson(scopeKey(WAVEFORM_PREFIX, scope), entries);
    return found;
};

export const writeWaveform = (scope: MediaScope, uploadId: string, waveform: StoredWaveform): void => {
    const entries = readWaveforms(scope);
    const order = [...entries.order.filter(id => id !== uploadId), uploadId];
    const bars: Record<string, StoredWaveform> = { ...entries.bars, [uploadId]: waveform };
    while (order.length > WAVEFORM_CACHE_MAX) {
        const dropped = order.shift();
        if (dropped) delete bars[dropped];
    }
    writeJson(scopeKey(WAVEFORM_PREFIX, scope), { order, bars });
};

export const setLocalMediaPrefsStorage = (next: KeyValueStore = deviceStore): void => {
    storage = next;
    hiddenCache.clear();
    changed();
};
