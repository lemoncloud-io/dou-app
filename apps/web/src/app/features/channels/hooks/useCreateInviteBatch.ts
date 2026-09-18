import { useTranslation } from 'react-i18next';

import type { UserInviteBatchPayload } from '@chatic/data';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { useUserMutations } from './useUserMutations';
// Direct path, not the `hooks` barrel: the barrel reaches web-core's transport, whose `import.meta`
// jest cannot parse — the same reason CreatePlaceDialog bypasses the `ui/layouts` barrel.
import { useMyProfile } from '../../../hooks/useMyProfile';
import { sendInviteMessage, type InviteMessageChannel } from '../../invite/utils/sendInviteMessage';

/**
 * User invite hook — supports both single and batch invites.
 * - createSingleInvite: invite 1 person → **sends the invite text via SMS** (app), or copies it
 *   to the clipboard on web.
 * - requestInviteLink: invite 1 person → returns only the Location link (doesn't auto-send it).
 *   For displaying/sharing on the invite link screen.
 * - createBatchInvite: batch-invite several people (the server sends the SMS).
 */
export const useCreateInviteBatch = () => {
    const { t } = useTranslation();
    const { requestInvite, requestInviteBatch, isPending } = useUserMutations();
    // The sender name used in the SMS body — the place-profile nick, not the account name.
    const { profile: myProfile } = useMyProfile();

    /**
     * After a single invite, **returns the server response's Location (deep-link URL) as a
     * string without sharing it**. The invite link screen displays this URL, and the screen's
     * own button handles the actual share/copy.
     */
    const requestInviteLink = async (params: { channelId: string; name: string; phone: string }): Promise<string> => {
        const inviteView = await requestInvite({
            channelId: params.channelId,
            name: params.name,
            phone: params.phone,
        });
        const location = (inviteView as any).Location as string | undefined;
        if (!location) {
            throw new Error('Invite link is missing from the response.');
        }
        return location;
    };

    /**
     * Single invite — **sends an SMS** to the target number containing the invite text with the
     * server response's Location (deep-link URL). On the app, this opens the SMS composer
     * pre-filled; on web, since there's no way to send an SMS, the text is copied to the
     * clipboard instead — the same rule that {@link sendInviteMessage} applies across the whole
     * invite path (ADR-0089 D4).
     *
     * The previous behavior of opening the OS share sheet made the user re-pick a recipient even
     * though the target number was already known.
     *
     * `channel` reports what actually performed the delivery, so the caller can distinguish its
     * messaging (`false` = the invite was issued but automatic delivery failed).
     */
    const createSingleInvite = async (params: {
        channelId: string;
        name: string;
        phone: string;
    }): Promise<{ inviteView: MyInviteView; channel: InviteMessageChannel | false }> => {
        const inviteView = await requestInvite({
            channelId: params.channelId,
            name: params.name,
            phone: params.phone,
        });

        const location = (inviteView as any).Location as string | undefined;
        if (!location) {
            return { inviteView, channel: false };
        }

        const body = t('inviteFriends.smsMessage', {
            senderName: myProfile?.nick || t('inviteFriends.defaultSenderName'),
            deeplink: location,
        });

        return { inviteView, channel: await sendInviteMessage(params.phone, body) };
    };

    /**
     * Batch invite — `to` is an array on the wire, so the number list is passed straight through
     * as an array. It used to be joined with commas into a single `alias`, but the server
     * rejected that while trying to parse the string as one number (`@phone[a,b] is invalid format`).
     *
     * Duplicates are removed here, since the server would send SMS twice to the same target if
     * the same number appeared twice (two contacts can share the same number). Order is preserved.
     */
    const createBatchInvite = async (params: { channelId: string; phones: string[] }): Promise<MyInviteView[]> => {
        const to = [...new Set(params.phones.map(phone => phone.trim()).filter(Boolean))];
        if (to.length === 0) return [];

        return requestInviteBatch({ to, channelId: params.channelId } as UserInviteBatchPayload);
    };

    return {
        createSingleInvite,
        requestInviteLink,
        createBatchInvite,
        isPending: isPending['invite'] || isPending['invite-batch'],
    };
};
