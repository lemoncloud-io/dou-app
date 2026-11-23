import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/runtime';
import { runtime } from '@chatic/runtime';

import { useNotificationPrefsStore, type ChannelNotifyMode } from '../stores';
import { placeNotifyKey, placeNotifyTargets, placeNotifyWrites, summarizePlaceNotify, toastFailure } from '../utils';
import { useDesktopChannelMutations } from './useChannelMutations';
import { useChannels } from './useChannels';
import { liveSelection, switchesSettled } from './switchesSettled';

export const usePlaceNotifyApply = () => {
    const { t } = useTranslation();
    const { setChannelNotify } = useDesktopChannelMutations();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const queryClient = useQueryClient();

    return useCallback(
        async (
            placeId: string,
            channels: readonly DomainChannel[],
            mode: ChannelNotifyMode,
            { remember = true, announce = true } = {}
        ): Promise<PromiseRejectedResult | undefined> => {
            const key = placeNotifyKey(selectedCloudId, placeId);
            await switchesSettled(queryClient);
            const store = useNotificationPrefsStore.getState();
            if (placeId !== liveSelection().placeId) {
                if (remember) store.setPlaceNotify(key, mode, []);
                return undefined;
            }
            const known = new Set(remember ? [] : (store.placeNotify[key]?.known ?? []));
            const targets = placeNotifyTargets(channels).filter(channel => !known.has(channel.id ?? ''));
            const ids = targets.map(channel => channel.id ?? '');
            if (remember) store.setPlaceNotify(key, mode, ids);
            else store.addPlaceKnown(key, ids);

            const writes = placeNotifyWrites(targets, store, mode);
            const delivered = writes.map(write => {
                store.setChannelNotify(write.channelId, write.notify);
                return setChannelNotify(write);
            });
            const results = await Promise.allSettled(delivered);
            const refused = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
            if (refused && announce) toastFailure(t('place.settings.notify.failed'), refused.reason);
            return refused;
        },
        [selectedCloudId, queryClient, setChannelNotify, t]
    );
};

export const usePlaceNotify = (placeId: string | undefined) => {
    const { channels } = useChannels(placeId);
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const key = placeId ? placeNotifyKey(selectedCloudId, placeId) : '';
    const isHere = !!placeId && placeId === selectedSiteId;
    const remembered = useNotificationPrefsStore(s => (key ? s.placeNotify[key]?.mode : undefined));
    const channelNotify = useNotificationPrefsStore(s => s.channelNotify);
    const mutedChannels = useNotificationPrefsStore(s => s.mutedChannels);
    const apply = usePlaceNotifyApply();

    const summary = useMemo(
        () => summarizePlaceNotify(channels, { channelNotify, mutedChannels }, remembered),
        [channels, channelNotify, mutedChannels, remembered]
    );

    const setMode = useCallback(
        (mode: ChannelNotifyMode) => {
            if (placeId) void apply(placeId, channels, mode);
        },
        [apply, channels, placeId]
    );

    return { ...summary, exceptions: isHere ? summary.exceptions : 0, isHere, setMode };
};
