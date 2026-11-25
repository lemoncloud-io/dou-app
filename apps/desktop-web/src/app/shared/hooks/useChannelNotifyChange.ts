import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/runtime-react';

import {
    channelNotifyMode,
    isNotifyDm,
    notifyModesFor,
    useNotificationPrefsStore,
    type ChannelNotifyMode,
} from '../stores';
import { useDesktopChannelMutations } from './useChannelMutations';
import { toastFailure } from '../utils';

export const useChannelNotifyChange = (channel: DomainChannel | undefined, myUid: string | null) => {
    const { t } = useTranslation();
    const { setChannelNotify } = useDesktopChannelMutations();
    const channelId = channel?.id ?? '';
    const isDm = isNotifyDm(channel);
    const notifyMode = useNotificationPrefsStore(s => channelNotifyMode(s, channelId, channel?.$join?.notify, isDm));

    const onNotifyChange = useCallback(
        (mode: ChannelNotifyMode) => {
            if (!channelId || mode === notifyMode) return;
            useNotificationPrefsStore.getState().setChannelNotify(channelId, mode);
            const joinUserId = channel?.$join?.userId ?? myUid ?? '';
            if (!joinUserId) return;
            void setChannelNotify({ channelId, userId: joinUserId, notify: mode }).catch((error: unknown) => {
                toastFailure(t('channels.settings.notify.syncFailed'), error);
            });
        },
        [channelId, notifyMode, channel, myUid, setChannelNotify, t]
    );

    return { notifyMode, notifyModes: notifyModesFor(isDm), onNotifyChange };
};
