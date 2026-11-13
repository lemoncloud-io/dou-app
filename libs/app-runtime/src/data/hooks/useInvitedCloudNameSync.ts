import { useEffect, useRef } from 'react';

import { useSessionSelection } from '../../session';
import { useRuntimeSocketState } from '../../connection/hooks/useRuntimeSocketState';
import { useSlotVerified } from '../../connection/hooks/useSlotVerified';
import { RELAY_SLOT } from '@chatic/transport';
import { isNativeApp } from '../../utils/isNativeApp';
import { syncInvitedCloudName } from '../dataCommands';

/**
 * Syncs the active invited cloud's authoritative name once its socket is verified. Runs once per
 * verified cloud. Native WebView only.
 *
 * The name is read from the relay (`cloud.get` is pinned there), so the relay slot has to be verified
 * too — the active slot's verification says nothing about it, and the run is spent once it starts.
 *
 * The use-case is the engine's `syncInvitedCloudName` — this is only the React trigger. It used to be declared in that file, which is how it escaped the hooks
 * rule: the guard checked filenames, and `invitedCloudDurability.ts` does not start with `use`.
 * The guard now reads declarations too.
 */
export const useInvitedCloudNameSync = (): void => {
    const { isVerified } = useRuntimeSocketState();
    const isRelayVerified = useSlotVerified(RELAY_SLOT);
    const { selectedCloudId } = useSessionSelection();
    const syncedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isNativeApp()) return;
        if (!isVerified || !isRelayVerified || !selectedCloudId) return;
        if (syncedRef.current === selectedCloudId) return;
        syncedRef.current = selectedCloudId;
        void syncInvitedCloudName(selectedCloudId);
    }, [isVerified, isRelayVerified, selectedCloudId]);
};
