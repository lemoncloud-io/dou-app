import { useEffect, useRef } from 'react';
import { useIsMutating } from '@tanstack/react-query';

import { RELAY_CLOUD_ID } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';

/**
 * Make sure my notes-to-self room exists in the subscription cloud I am in.
 *
 * A subscription cloud does not create the room on its own: it exists once something asks
 * `channel.get-self`, which gets or creates it (one per person per cloud). Without this a new cloud
 * member had no notes-to-self room in the sidebar until they picked themselves in the New message
 * picker. The relay needs nothing — its sync already brings the room.
 *
 * Asked once per cloud per app session, when the socket is verified, a place is open (the answer
 * carries no place, and the repository tags the row with the one it is handed) and no switch is in
 * flight. A failure is logged and asked again the next time those hold (a reconnect, a place change,
 * a switch ending).
 */
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
