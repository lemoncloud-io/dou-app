import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { channelNotifyMode, useNotificationPrefsStore, type ChannelNotifyMode } from '../stores';
import { useDesktopChannelMutations } from './useChannelMutations';

/**
 * One writer for the per-channel notify mode, shared by the settings panel and the
 * row menu (they carried separate copies of the same lines). The local pref applies
 * instantly; the server half goes through the join repository's outbox, which resends it
 * until it lands. Only a refusal comes back as a rejection, and it is announced instead of
 * swallowed: other devices follow the server record, so silence here would read as success.
 */
export const useChannelNotifyChange = (channel: DomainChannel | undefined, myUid: string | null) => {
    const { t } = useTranslation();
    const { setChannelNotify } = useDesktopChannelMutations();
    const channelId = channel?.id ?? '';
    const notifyMode = useNotificationPrefsStore(s => channelNotifyMode(s, channelId, channel?.$join?.notify));

    const onNotifyChange = useCallback(
        (mode: ChannelNotifyMode) => {
            if (!channelId || mode === notifyMode) return;
            useNotificationPrefsStore.getState().setChannelNotify(channelId, mode);
            const joinUserId = channel?.$join?.userId ?? myUid ?? '';
            if (!joinUserId) return;
            void setChannelNotify({ channelId, userId: joinUserId, notify: mode }).catch(() => {
                toast({ title: t('channels.settings.notify.syncFailed'), variant: 'destructive' });
            });
        },
        [channelId, notifyMode, channel, myUid, setChannelNotify, t]
    );

    return { notifyMode, onNotifyChange };
};
