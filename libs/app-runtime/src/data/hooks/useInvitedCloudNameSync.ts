import { useEffect, useRef } from 'react';

import { useSessionSelection } from '../../session';
import { useRuntimeSocketState } from '../../connection/hooks/useRuntimeSocketState';
import { useSlotVerified } from '../../connection/hooks/useSlotVerified';
import { RELAY_SLOT } from '@chatic/transport';
import { hostProfile } from '@chatic/bridges';
import { syncInvitedCloudName } from '../dataCommands';

/**
 * Syncs the active invited cloud's authoritative name once its socket is verified. Runs once per
 * verified cloud. Phone app only: the host profile's bridge is the phone's `ReactNativeWebView` channel —
 * the same question `isNativeApp()` asks, so the desktop shell's message handler does not count.
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
        if (hostProfile().bridge !== 'react-native-webview') return;
        if (!isVerified || !isRelayVerified || !selectedCloudId) return;
        if (syncedRef.current === selectedCloudId) return;
        syncedRef.current = selectedCloudId;
        void syncInvitedCloudName(selectedCloudId);
    }, [isVerified, isRelayVerified, selectedCloudId]);
};
