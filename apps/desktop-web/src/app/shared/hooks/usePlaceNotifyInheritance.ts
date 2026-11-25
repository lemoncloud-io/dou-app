import { useEffect, useRef } from 'react';

import type { DomainChannel } from '@chatic/runtime-react';
import { runtime } from '@chatic/runtime-react';

import { useNotificationPrefsStore } from '../stores';
import { channelsByPlace, placeNotifyKey, placeNotifyTargets } from '../utils';
import { usePlaceNotifyApply } from './usePlaceNotify';

const NO_FILED_PLACES: ReadonlyMap<string, readonly string[]> = new Map();

export const usePlaceNotifyInheritance = () => {
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const { userId: myUid } = runtime.session.useSessionIdentity();
    const apply = usePlaceNotifyApply();
    const applyRef = useRef(apply);
    applyRef.current = apply;

    useEffect(() => {
        if (!myUid || !selectedSiteId) return;
        let cancelled = false;
        const unsubscribe = channelRepository.observeList({ sid: '' }, result => {
            if (cancelled) return;
            const rows: DomainChannel[] = result?.list ?? [];
            const { placeNotify } = useNotificationPrefsStore.getState();
            const channels = channelsByPlace(rows, NO_FILED_PLACES).get(selectedSiteId) ?? [];
            const pref = placeNotify[placeNotifyKey(selectedCloudId, selectedSiteId)];
            if (!pref) return;
            const known = new Set(pref.known);
            const fresh = placeNotifyTargets(channels).filter(channel => !known.has(channel.id ?? ''));
            if (fresh.length > 0) {
                void applyRef.current(selectedSiteId, fresh, pref.mode, { remember: false, announce: false });
            }
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [channelRepository, selectedCloudId, selectedSiteId, myUid]);
};
