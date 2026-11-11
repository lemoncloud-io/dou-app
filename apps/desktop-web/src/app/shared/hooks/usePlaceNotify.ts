import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { useNotificationPrefsStore, type ChannelNotifyMode } from '../stores';
import { placeNotifyKey, placeNotifyTargets, placeNotifyWrites, summarizePlaceNotify, toastFailure } from '../utils';
import { useDesktopChannelMutations } from './useChannelMutations';
import { useChannels } from './useChannels';
import { liveSelection, switchesSettled } from './switchesSettled';

/**
 * The one writer for a place-level notification choice, shared by the place page, the cloud page
 * and the inheritance runner. There is no place field on the server, so the choice is written as
 * each channel's own level: the local pref at once, and `join.notify` through the join outbox — the
 * server's per-member record, which other devices follow. The level is also remembered on this
 * device with the channels it reached, so a channel seen later inherits it.
 *
 * The server takes a join write only for the place the session is in; for any other place it
 * answers `NOT ALLOWED`. So only that place is written now. Another place's level is remembered
 * with nothing known, and the inheritance runner writes it when the session enters that place.
 * "In" is judged after any running place switch has settled: during one the selection already names
 * the new place while the session, and so the server, is still in the one being left.
 *
 * Applying resolves, once the server half has settled, to the first refusal if there was one. A
 * caller that writes several places as one batch passes `announce: false` and announces the batch
 * itself, so a refused batch raises one toast, not one per place.
 */
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
            // Read after the wait: an inheritance pass that started during the switch may have been
            // overtaken by another one that already gave these channels the level.
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

/**
 * The place page's notification control: the place's level, the exceptions, and the setter.
 * `isHere` is whether the session is in the place, the only one a level is written to at once;
 * exceptions are counted only there, since elsewhere the level is still waiting to be written.
 */
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
