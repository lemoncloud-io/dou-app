import { useEffect, useState } from 'react';

import { createPairedCloudNameSync, RELAY_SLOT } from '@chatic/runtime-client';

import { useSessionSelection } from '../../session';
import { usePairedCloudIds } from '../../session/hooks/pairing/usePairedSession';
import { useRuntimeSocketState } from '../../connection/hooks/useRuntimeSocketState';
import { useSlotVerified } from '../../connection/hooks/useSlotVerified';

/**
 * Reads the active paired cloud's name once its socket and the relay are verified. Runs once per
 * entered cloud, in the browser and in the shells alike — pairing is a browser-side feature, so unlike
 * the invited-cloud sync this is not limited to the native WebView.
 *
 * The once-per-entry gate is runtime-client's `createPairedCloudNameSync` and the use-case the engine's
 * `syncPairedCloudName`; this is only the React trigger. The
 * name is read from the relay, so the relay slot has to be verified too, and the run is spent once it
 * starts — a failure waits for the next entry into the cloud rather than retrying in a loop. Switching
 * away, or the cloud leaving the paired list, ends the entry.
 */
export const usePairedCloudNameSync = (): void => {
    const { isVerified } = useRuntimeSocketState();
    const isRelayVerified = useSlotVerified(RELAY_SLOT);
    const { selectedCloudId } = useSessionSelection();
    const pairedCloudIds = usePairedCloudIds();
    const isPaired = !!selectedCloudId && pairedCloudIds.includes(selectedCloudId);
    // One gate per mount: it remembers the entry it already read.
    const [sync] = useState(createPairedCloudNameSync);

    useEffect(() => {
        sync({ cloudId: selectedCloudId, isPaired, ready: isVerified && isRelayVerified });
    }, [sync, isPaired, isVerified, isRelayVerified, selectedCloudId]);
};
