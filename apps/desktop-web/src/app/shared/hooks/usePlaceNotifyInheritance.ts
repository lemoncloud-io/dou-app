import { useEffect, useRef } from 'react';

import type { DomainChannel } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { useNotificationPrefsStore } from '../stores';
import { channelsByPlace, placeNotifyKey, placeNotifyTargets } from '../utils';
import { usePlaceNotifyApply } from './usePlaceNotify';

const NO_FILED_PLACES: ReadonlyMap<string, readonly string[]> = new Map();

/**
 * Gives a channel this device sees for the first time the level its place was set to. A place
 * level exists only as each channel's own join.notify (see `usePlaceNotifyApply`), so a channel
 * made after the level was chosen would otherwise keep the server's default. "First time" is the
 * place's `known` list: a channel in it was already given the level, and a different level on it
 * now is the person's own exception, which is never overwritten.
 *
 * It reads the active cloud's channel cache, the same rows the sidebar lists, so a channel inherits
 * once the app has seen it. A message that arrives in a channel this device has never listed can
 * still be pushed at the server's default level.
 */
export const usePlaceNotifyInheritance = () => {
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { userId: myUid } = runtime.session.useSessionIdentity();
    const apply = usePlaceNotifyApply();
    const applyRef = useRef(apply);
    applyRef.current = apply;

    useEffect(() => {
        if (!myUid) return;
        let cancelled = false;
        const unsubscribe = channelRepository.observeList({ sid: '' }, result => {
            if (cancelled) return;
            const rows: DomainChannel[] = result?.list ?? [];
            const { placeNotify } = useNotificationPrefsStore.getState();
            channelsByPlace(rows, NO_FILED_PLACES).forEach((channels, placeId) => {
                const key = placeNotifyKey(selectedCloudId, placeId);
                const pref = placeNotify[key];
                if (!pref) return;
                const known = new Set(pref.known);
                const fresh = placeNotifyTargets(channels).filter(channel => !known.has(channel.id ?? ''));
                // Nobody asked for this write, so a refusal is not announced: the channel keeps its
                // level on this device, and the person sees the server's on the channel itself.
                if (fresh.length > 0) {
                    void applyRef.current(key, fresh, pref.mode, { remember: false, announce: false });
                }
            });
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [channelRepository, selectedCloudId, myUid]);
};
