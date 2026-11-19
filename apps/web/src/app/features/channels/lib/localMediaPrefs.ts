import { useSyncExternalStore } from 'react';

import { chatMediaEntries, type DomainChat } from '@chatic/runtime';
import type { KeyValueStore } from '@chatic/storage';

import { deviceStore } from '../../../storage';

/**
 * What this device remembers about a room's files beyond the message cache: the attachments and links
 * hidden on this device, and each audio file's computed waveform. Both live in the page's device store
 * (`localStorage`), one entry per cloud and account (`<cid>:<uid>`), because neither is server state
 * and neither may ride on a cached message row — a page from the server rewrites the row and would
 * drop the mark. The keys are server identities (a message number, an upload id), so clearing the
 * message cache does not lose them; clearing the app's data does, which is accepted: a hidden file
 * then shows again, and a waveform is computed again.
 *
 * Every read and write tolerates a store that throws or holds garbage: hiding then simply does not
 * stick, and a waveform is drawn decoratively — the screen keeps working either way.
 */

export interface MediaScope {
    cid: string;
    uid: string;
}

/** A room item's key: `<channelId>:<chatNo>:<idx>` — the media index's own identity for an entry. */
export const hiddenMediaKey = (channelId: string, chatNo: number, idx: number): string =>
    `${channelId}:${chatNo}:${idx}`;

/**
 * What of one message is hidden on this device: upload positions, and link addresses. Keyed by the media
 * index's own entries, so a key here and a row in the room's file list always name the same thing.
 */
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
/** Waveforms kept per account; the least recently used goes first. 500 × 48 numbers is ~150 KB. */
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

// Parsed sets are kept per scope and rebuilt only after a change, so a render reading them is cheap.
const hiddenCache = new Map<string, { version: number; set: ReadonlySet<string> }>();

/** The keys hidden on this device for one account in one cloud. */
export const readHiddenMedia = (scope: MediaScope): ReadonlySet<string> => {
    const key = scopeKey(HIDDEN_PREFIX, scope);
    const cached = hiddenCache.get(key);
    if (cached && cached.version === version) return cached.set;
    const list = readJson<unknown>(key);
    const set = new Set(Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : []);
    hiddenCache.set(key, { version, set });
    return set;
};

/** Hides `keys` on this device. */
export const hideMedia = (scope: MediaScope, keys: readonly string[]): void => {
    if (keys.length === 0) return;
    const next = new Set(readHiddenMedia(scope));
    keys.forEach(key => next.add(key));
    writeJson(scopeKey(HIDDEN_PREFIX, scope), [...next]);
    changed();
};

/** Shows `keys` again — the undo of `hideMedia`. */
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

/** The hidden keys for a scope, re-rendering on every hide and undo. No scope yet reads as nothing hidden. */
export const useHiddenMedia = (scope: MediaScope | undefined): ReadonlySet<string> =>
    useSyncExternalStore(
        subscribe,
        () => (scope?.cid && scope.uid ? readHiddenMedia(scope) : EMPTY),
        () => EMPTY
    );

/** A stored waveform: bar heights, or `'decorative'` — it could not be computed, so do not try again. */
export type StoredWaveform = readonly number[] | 'decorative';

interface WaveformEntries {
    /** Upload ids, least recently used first. */
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

/** The waveform kept for an upload, marking it as just used. */
export const readWaveform = (scope: MediaScope, uploadId: string): StoredWaveform | undefined => {
    const entries = readWaveforms(scope);
    const found = entries.bars[uploadId];
    if (!validWaveform(found)) return undefined;
    entries.order = [...entries.order.filter(id => id !== uploadId), uploadId];
    writeJson(scopeKey(WAVEFORM_PREFIX, scope), entries);
    return found;
};

/** Keeps an upload's waveform, dropping the least recently used beyond `WAVEFORM_CACHE_MAX`. */
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

/** Test seam: another store, and nothing remembered from the last test. */
export const setLocalMediaPrefsStorage = (next: KeyValueStore = deviceStore): void => {
    storage = next;
    hiddenCache.clear();
    changed();
};
