import type { SocketBindingConfig } from '../../socket';
import { backgroundClouds, selectBackgroundClouds, usableBackgroundEntryOf } from '../../socket/backgroundClouds';
import { isBackgroundCloudReady } from '../../socket/auth/backgroundCloudTokens';
import { getSocketManager } from '../../socket/runtime';
// Concrete paths, off the session barrel: the committed cloud id and the stores are runtime-internal.
import { credentialFreshness } from '../../session/auth/credentialFreshness';
import { getCommittedCloudId } from '../../session/store';
import { cloudStore } from '../../session/store/stores';

/**
 * The live reads behind background slots, shared by the slot derivation and the token preparer so
 * the two agree on which clouds are wanted and which are ready. Not pure: every read goes to the
 * stores and the manager at call time, and nothing here is cached.
 */

/** The clouds that should hold a background slot right now, in the policy's order. */
export const currentBackgroundSelection = (): string[] =>
    selectBackgroundClouds({
        joined: backgroundClouds.getJoined(),
        recent: cloudStore.getRecentClouds(),
        committed: getCommittedCloudId(),
        // A hold keeps a slot, it does not open one: the write that took it goes out at once, so a
        // slot booted for it would arrive after that write had already failed, and be torn down again
        // as the hold ended.
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

/**
 * The binding configs of the background slots that are ready to boot. A cloud whose tokens are still
 * being prepared is left out until they land; its slot appears on the re-derive that follows.
 */
export const readyBackgroundConfigs = (deviceId: string): SocketBindingConfig[] =>
    currentBackgroundSelection().flatMap(cid => {
        const url = usableBackgroundEntryOf(cid)?.delegationToken.wss;
        if (!url || !isBackgroundCloudReady(cid, liveBackgroundReadiness)) return [];
        return [{ url, deviceId, wssType: 'cloud' as const, cid }];
    });
