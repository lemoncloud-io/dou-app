import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/runtime-react';

import { useCloudSessionCatalog } from './useCloudCatalog';

export const useInvitedCloudRecovery = (): void => {
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const isRelayVerified = runtime.connection.useSlotVerified(runtime.connection.RELAY_SLOT);
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const recoveredRef = useRef<string | null>(null);
    const isOwned = ownedClouds.some(c => c.id === selectedCloudId);

    useEffect(() => {
        if (!isVerified || !isRelayVerified || !selectedCloudId || selectedCloudId === 'default' || isOwned) return;
        if (recoveredRef.current === selectedCloudId) return;
        recoveredRef.current = selectedCloudId;

        void (async () => {
            await runtime.data.recoverInvitedCloudIfMissing(selectedCloudId);
            await runtime.data.syncInvitedCloudName(selectedCloudId);
        })().catch(() => undefined);
    }, [isVerified, isRelayVerified, selectedCloudId, isOwned]);
};
