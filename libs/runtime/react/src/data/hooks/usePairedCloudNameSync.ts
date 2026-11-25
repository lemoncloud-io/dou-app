import { useEffect, useState } from 'react';

import { createPairedCloudNameSync, RELAY_SLOT } from '@chatic/runtime-client';

import { useSessionSelection } from '../../session';
import { usePairedCloudIds } from '../../session/hooks/pairing/usePairedSession';
import { useRuntimeSocketState } from '../../connection/hooks/useRuntimeSocketState';
import { useSlotVerified } from '../../connection/hooks/useSlotVerified';

export const usePairedCloudNameSync = (): void => {
    const { isVerified } = useRuntimeSocketState();
    const isRelayVerified = useSlotVerified(RELAY_SLOT);
    const { selectedCloudId } = useSessionSelection();
    const pairedCloudIds = usePairedCloudIds();
    const isPaired = !!selectedCloudId && pairedCloudIds.includes(selectedCloudId);
    const [sync] = useState(createPairedCloudNameSync);

    useEffect(() => {
        sync({ cloudId: selectedCloudId, isPaired, ready: isVerified && isRelayVerified });
    }, [sync, isPaired, isVerified, isRelayVerified, selectedCloudId]);
};
