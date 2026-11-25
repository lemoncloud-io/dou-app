import { useEffect, useState } from 'react';

import { createInvitedCloudNameSync, RELAY_SLOT } from '@chatic/runtime-client';
import { hostProfile } from '@chatic/bridges';

import { useSessionSelection } from '../../session';
import { useRuntimeSocketState } from '../../connection/hooks/useRuntimeSocketState';
import { useSlotVerified } from '../../connection/hooks/useSlotVerified';

export const useInvitedCloudNameSync = (): void => {
    const { isVerified } = useRuntimeSocketState();
    const isRelayVerified = useSlotVerified(RELAY_SLOT);
    const { selectedCloudId } = useSessionSelection();
    const [sync] = useState(createInvitedCloudNameSync);

    useEffect(() => {
        if (hostProfile().bridge !== 'react-native-webview') return;
        sync({ cloudId: selectedCloudId, ready: isVerified && isRelayVerified });
    }, [sync, isVerified, isRelayVerified, selectedCloudId]);
};
