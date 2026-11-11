import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { useNotificationPrefsStore, type ChannelNotifyMode } from '../stores';
import { placeNotifyKey, placeNotifyTargets, placeNotifyWrites, summarizePlaceNotify, toastFailure } from '../utils';
import { useDesktopChannelMutations } from './useChannelMutations';
import { useChannels } from './useChannels';

/**
 * The one writer for a place-level notification choice, shared by the place page, the cloud page
 * and the inheritance runner. There is no place field on the server, so the choice is written as
 * each channel's own level: the local pref at once, and `join.notify` through the join outbox — the
 * server's per-member record, which other devices follow. The level is also remembered on this
 * device with the channels it reached, so a channel seen later inherits it.
 *
 * Applying resolves, once the server half has settled, to the first refusal if there was one. A
 * caller that writes several places as one batch passes `announce: false` and announces the batch
 * itself, so a refused batch raises one toast, not one per place.
 */
export const usePlaceNotifyApply = () => {
    const { t } = useTranslation();
    const { setChannelNotify } = useDesktopChannelMutations();

    return useCallback(
        (
            key: string,
            channels: readonly DomainChannel[],
            mode: ChannelNotifyMode,
            { remember = true, announce = true } = {}
        ): Promise<PromiseRejectedResult | undefined> => {
            const store = useNotificationPrefsStore.getState();
            const ids = placeNotifyTargets(channels).map(channel => channel.id ?? '');
            if (remember) store.setPlaceNotify(key, mode, ids);
            else store.addPlaceKnown(key, ids);

            const writes = placeNotifyWrites(channels, store, mode);
            const delivered = writes.map(write => {
                store.setChannelNotify(write.channelId, write.notify);
                return setChannelNotify(write);
            });
            return Promise.allSettled(delivered).then(results => {
                const refused = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
                if (refused && announce) toastFailure(t('place.settings.notify.failed'), refused.reason);
                return refused;
            });
        },
        [setChannelNotify, t]
    );
};

/** The place page's notification control: the place's level, the exceptions, and the setter. */
export const usePlaceNotify = (placeId: string | undefined) => {
    const { channels } = useChannels(placeId);
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const key = placeId ? placeNotifyKey(selectedCloudId, placeId) : '';
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
            if (key) void apply(key, channels, mode);
        },
        [apply, channels, key]
    );

    return { ...summary, setMode };
};
