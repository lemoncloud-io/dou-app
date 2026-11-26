import { backgroundClouds, selectBackgroundClouds, usableBackgroundEntryOf, getSocketManager } from '@chatic/transport';
import type { SocketBindingConfig } from '@chatic/transport';
import { isBackgroundCloudReady } from '@chatic/auth';
import { credentialFreshness, getCommittedCloudId, cloudStore } from '@chatic/session';

export const currentBackgroundSelection = (): string[] =>
    selectBackgroundClouds({
        joined: backgroundClouds.getJoined(),
        recent: cloudStore.getRecentClouds(),
        committed: getCommittedCloudId(),
        held: backgroundClouds.getHeld().filter(liveBackgroundReadiness.isSlotBound),
    });

export const liveBackgroundReadiness = {
    hasEntry: (cid: string): boolean => usableBackgroundEntryOf(cid) != null,
    timeToExpiry: (cid: string): number | null => credentialFreshness.timeToExpiry(cid),
    isSlotBound: (cid: string): boolean =>
        getSocketManager()
            .getSlotKeys()
            .some(key => key === cid),
};

export const readyBackgroundConfigs = (deviceId: string): SocketBindingConfig[] =>
    currentBackgroundSelection().flatMap(cid => {
        const url = usableBackgroundEntryOf(cid)?.delegationToken.wss;
        if (!url || !isBackgroundCloudReady(cid, liveBackgroundReadiness)) return [];
        return [{ url, deviceId, wssType: 'cloud' as const, cid }];
    });
