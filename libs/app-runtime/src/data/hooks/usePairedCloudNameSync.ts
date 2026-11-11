import { useEffect, useRef } from 'react';

import { RELAY_SLOT } from '@chatic/transport';

import { useSessionSelection } from '../../session';
import { usePairedCloudIds } from '../../session/hooks/pairing/usePairedSession';
import { useRuntimeSocketState } from '../../connection/hooks/useRuntimeSocketState';
import { useSlotVerified } from '../../connection/hooks/useSlotVerified';
import { syncPairedCloudName } from '../pairedCloudName';
import { useRuntimeRepositories } from './useRuntimeRepositories';

/**
 * Reads the active paired cloud's name once its socket and the relay are verified. Runs once per
 * entered cloud, in the browser and in the shells alike — pairing is a browser-side feature, so unlike
 * the invited-cloud sync this is not limited to the native WebView.
 *
 * The use-case is [`syncPairedCloudName`](../pairedCloudName.ts); this is only the React trigger. The
 * name is read from the relay, so the relay slot has to be verified too, and the run is spent once it
 * starts — a failure waits for the next entry into the cloud rather than retrying in a loop. Switching
 * away, or the cloud leaving the paired list, ends the entry.
 */
export const usePairedCloudNameSync = (): void => {
    const { cloud } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();
    const isRelayVerified = useSlotVerified(RELAY_SLOT);
    const { selectedCloudId } = useSessionSelection();
    const pairedCloudIds = usePairedCloudIds();
    const isPaired = !!selectedCloudId && pairedCloudIds.includes(selectedCloudId);
    const syncedRef = useRef<string | null>(null);

    useEffect(() => {
        // Leaving the cloud (or its pairing ending) closes the entry, so the next entry reads again —
        // a failed read retries there, and a re-paired cloud gets its name back.
        if (!isPaired || !selectedCloudId) {
            syncedRef.current = null;
            return;
        }
        if (!isVerified || !isRelayVerified) return;
        if (syncedRef.current === selectedCloudId) return;
        syncedRef.current = selectedCloudId;
        void syncPairedCloudName(cloud, selectedCloudId);
    }, [cloud, isPaired, isVerified, isRelayVerified, selectedCloudId]);
};
