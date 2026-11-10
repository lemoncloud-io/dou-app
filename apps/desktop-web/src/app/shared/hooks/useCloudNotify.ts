import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { useNotificationPrefsStore, type ChannelNotifyMode } from '../stores';
import { channelsByPlace, placeNotifyKey, summarizePlaceNotify, toastFailure } from '../utils';
import { usePlaceNotifyApply } from './usePlaceNotify';
import { usePlaces } from './usePlaces';

const NO_FILED_PLACES: ReadonlyMap<string, readonly string[]> = new Map();

/**
 * A cloud's notification level: the place level (see `usePlaceNotifyApply`) applied to every place
 * of the cloud, places with no channel yet included, so their first channels inherit it. Only the
 * active cloud can be set: its channels are what the session can list, and another cloud's would
 * need that cloud's session, so `isActive` is false there and the caller offers a switch instead.
 *
 * `mode` is the level every place of the cloud shares, else null.
 */
export const useCloudNotify = (cloudId: string | undefined) => {
    const { t } = useTranslation();
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { placeIds } = usePlaces();
    const channelNotify = useNotificationPrefsStore(s => s.channelNotify);
    const mutedChannels = useNotificationPrefsStore(s => s.mutedChannels);
    const placeNotify = useNotificationPrefsStore(s => s.placeNotify);
    const apply = usePlaceNotifyApply();
    const isActive = !!cloudId && cloudId === selectedCloudId;
    const [rows, setRows] = useState<DomainChannel[]>([]);

    useEffect(() => {
        if (!isActive) {
            setRows([]);
            return;
        }
        let cancelled = false;
        const unsubscribe = channelRepository.observeList({ sid: '' }, result => {
            if (!cancelled) setRows(result?.list ?? []);
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [channelRepository, isActive]);

    const byPlace = useMemo(() => channelsByPlace(rows, NO_FILED_PLACES), [rows]);

    const mode = useMemo(() => {
        if (!isActive || placeIds.length === 0) return null;
        const modes = placeIds.map(
            placeId =>
                summarizePlaceNotify(
                    byPlace.get(placeId) ?? [],
                    { channelNotify, mutedChannels },
                    placeNotify[placeNotifyKey(selectedCloudId, placeId)]?.mode
                ).mode
        );
        return modes.every(each => each === modes[0]) ? modes[0] : null;
    }, [isActive, placeIds, byPlace, channelNotify, mutedChannels, placeNotify, selectedCloudId]);

    const setMode = useCallback(
        (next: ChannelNotifyMode) => {
            if (!isActive) return;
            const batch = placeIds.map(placeId =>
                apply(placeNotifyKey(selectedCloudId, placeId), byPlace.get(placeId) ?? [], next, { announce: false })
            );
            void Promise.all(batch).then(results => {
                const refused = results.find(result => result !== undefined);
                if (refused) toastFailure(t('place.settings.notify.failed'), refused.reason);
            });
        },
        [isActive, placeIds, apply, selectedCloudId, byPlace, t]
    );

    return { isActive, mode, setMode };
};
