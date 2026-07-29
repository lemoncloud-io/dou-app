import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';

import { useMyProfile } from '../../../hooks';
import { resolveSelfChatTitle } from '../utils/selfChatTitle';

/**
 * Title for a self-chat channel: the per-user join nick, else the owner's (my)
 * display name, else the "나와의 채팅" label. Since a self-chat's owner is always
 * the current user, the owner name is my active-site profile nick
 * (`useMyProfile`) — the same display identity shown across the app. The
 * user-record name is deliberately NOT used: it can be a raw id/UUID.
 *
 * The result is only meaningful for `stereo === 'self'` channels; callers gate
 * on `isSelfChat` before using it.
 *
 * NOTE: `useMyProfile` triggers a `getMyProfile()` fetch, so avoid calling this
 * per-row in a list — resolve the nick once and use {@link resolveSelfChatTitle}
 * directly (see `ChannelList`).
 */
export const useSelfChatTitle = (channel: DomainChannel | null | undefined): string => {
    const { t } = useTranslation();
    const { profile } = useMyProfile();

    // Pass the join's own userId so a default nick (server-seeded to that raw id/UUID) is skipped
    // in favor of the human profile nick.
    return resolveSelfChatTitle(
        channel?.$join?.nick,
        profile?.nick,
        t('channelList.selfChannel'),
        channel?.$join?.userId
    );
};
