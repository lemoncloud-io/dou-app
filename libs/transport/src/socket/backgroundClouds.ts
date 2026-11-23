import { RELAY_CLOUD_ID } from '@chatic/data';

import { cloudStore } from '@chatic/session';
import type { CachedCloudTokens } from '@chatic/session';

export const MAX_BACKGROUND_CLOUDS = 5;

export interface BackgroundCloudInputs {
    joined: readonly string[];
    recent: readonly string[];
    committed: string | null;
    held?: readonly string[];
    max?: number;
}

export const selectBackgroundClouds = ({
    joined,
    recent,
    committed,
    held = [],
    max = MAX_BACKGROUND_CLOUDS,
}: BackgroundCloudInputs): string[] => {
    const isBackground = (cid: string): boolean => !!cid && cid !== RELAY_CLOUD_ID && cid !== committed;
    const eligible = new Set(joined.filter(isBackground));
    const ordered = [...recent.filter(cid => eligible.has(cid)), ...eligible];
    const capped = [...new Set(ordered)].slice(0, Math.max(0, max));
    return [...new Set([...capped, ...held.filter(isBackground)])];
};

export const usableBackgroundEntryOf = (cid: string): CachedCloudTokens | null => {
    const entry = cloudStore.peekCachedCloudTokens(cid);
    return entry?.delegationToken?.wss && entry.cloudToken?.Token?.identityToken ? entry : null;
};

export const hasLiveJoinedSession = (cid: string): boolean =>
    joined.includes(cid) && usableBackgroundEntryOf(cid) != null;

type Listener = () => void;

let joined: readonly string[] = [];
let version = 0;
const expired = new Set<string>();
const holds = new Map<string, number>();
const listeners = new Set<Listener>();

const notify = (): void => {
    version += 1;
    for (const listener of [...listeners]) listener();
};

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((cid, index) => cid === b[index]);

export const backgroundClouds = {
    setJoined(cids: readonly string[]): void {
        if (sameList(joined, cids)) return;
        joined = [...cids];
        notify();
    },
    getJoined(): readonly string[] {
        return joined;
    },
    invalidate(): void {
        notify();
    },
    noteExpired(cid: string): void {
        expired.add(cid);
        notify();
    },
    hold(cid: string): () => void {
        holds.set(cid, (holds.get(cid) ?? 0) + 1);
        if (holds.get(cid) === 1) notify();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const count = (holds.get(cid) ?? 1) - 1;
            if (count > 0) {
                holds.set(cid, count);
                return;
            }
            holds.delete(cid);
            notify();
        };
    },
    getHeld(): readonly string[] {
        return [...holds.keys()];
    },
    takeExpired(cid: string): boolean {
        return expired.delete(cid);
    },
    getVersion(): number {
        return version;
    },
    subscribe(listener: Listener): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

export const resetBackgroundClouds = (): void => {
    joined = [];
    version = 0;
    expired.clear();
    holds.clear();
    listeners.clear();
};
