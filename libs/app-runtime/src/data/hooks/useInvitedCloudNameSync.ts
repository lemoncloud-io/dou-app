import { useEffect, useRef } from 'react';

import { useSessionSelection } from '../../session';
import { useRuntimeRepositories } from './useRuntimeRepositories';
import { useRuntimeSocketState } from '../../connection/hooks/useRuntimeSocketState';
import { isNativeApp } from '../../utils/isNativeApp';
import { syncInvitedCloudName } from '../invitedCloudDurability';

/**
 * Syncs the active invited cloud's authoritative name once its socket is verified. Runs once per
 * verified cloud. Native WebView only.
 *
 * The use-cases it drives stay in [`invitedCloudDurability`](../invitedCloudDurability.ts) — this is
 * only the React trigger. It used to be declared in that file, which is how it escaped the hooks
 * rule: the guard checked filenames, and `invitedCloudDurability.ts` does not start with `use`.
 * The guard now reads declarations too.
 */
export const useInvitedCloudNameSync = (): void => {
    const { cloud } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();
    const { selectedCloudId } = useSessionSelection();
    const syncedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isNativeApp()) return;
        if (!isVerified || !selectedCloudId) return;
        if (syncedRef.current === selectedCloudId) return;
        syncedRef.current = selectedCloudId;
        void syncInvitedCloudName(cloud, selectedCloudId);
    }, [cloud, isVerified, selectedCloudId]);
};
