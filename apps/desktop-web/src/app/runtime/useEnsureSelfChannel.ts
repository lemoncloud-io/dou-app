import { useEffect, useRef } from 'react';
import { useIsMutating } from '@tanstack/react-query';

import { RELAY_CLOUD_ID, runtime } from '@chatic/runtime-react';
import { logger } from '@chatic/bridges';

export const useEnsureSelfChannel = (): void => {
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const session = runtime.session.useGlobalSession();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const isSwitching =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;

    const cloudId = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : null;
    const askedRef = useRef(new Set<string>());

    useEffect(() => {
        if (!cloudId || cloudId === RELAY_CLOUD_ID || !selectedSiteId || !isVerified || isSwitching) return;
        if (askedRef.current.has(cloudId)) return;
        askedRef.current.add(cloudId);
        channelRepository.getSelfChannel(undefined, selectedSiteId).catch((error: unknown) => {
            askedRef.current.delete(cloudId);
            logger.warn('CHANNEL', '[useEnsureSelfChannel] get-self failed', { cloudId, error });
        });
    }, [channelRepository, cloudId, selectedSiteId, isVerified, isSwitching]);
};
