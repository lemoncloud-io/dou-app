import { useTranslation } from 'react-i18next';

import type { UserInviteBatchPayload } from '@chatic/runtime-react';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { useUserMutations } from './useUserMutations';
import { useMyProfile } from '../../../hooks/useMyProfile';
import { sendInviteMessage, type InviteMessageChannel } from '../../invite/utils/sendInviteMessage';

const roomOf = (channelId?: string) => (channelId ? { channelId } : {});

export const useCreateInviteBatch = () => {
    const { t } = useTranslation();
    const { requestInvite, requestInviteBatch, isPending } = useUserMutations();
    const { profile: myProfile } = useMyProfile();

    const requestInviteLink = async (params: { channelId?: string; name: string; phone: string }): Promise<string> => {
        const inviteView = await requestInvite({
            ...roomOf(params.channelId),
            name: params.name,
            phone: params.phone,
        });
        const location = (inviteView as any).Location as string | undefined;
        if (!location) {
            throw new Error('Invite link is missing from the response.');
        }
        return location;
    };

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

    const createPlaceInvite = async (params: {
        name: string;
        phone: string;
        placeName: string;
    }): Promise<{ inviteView: MyInviteView; channel: InviteMessageChannel | false }> => {
        const inviteView = await requestInvite({ name: params.name, phone: params.phone });

        const location = (inviteView as any).Location as string | undefined;
        if (!location) {
            return { inviteView, channel: false };
        }

        const body = t('placeInvite.smsMessage', {
            senderName: myProfile?.nick || t('inviteFriends.defaultSenderName'),
            placeName: params.placeName,
            deeplink: location,
        });

        return { inviteView, channel: await sendInviteMessage(params.phone, body) };
    };

    const createBatchInvite = async (params: { channelId?: string; phones: string[] }): Promise<MyInviteView[]> => {
        const to = [...new Set(params.phones.map(phone => phone.trim()).filter(Boolean))];
        if (to.length === 0) return [];

        return requestInviteBatch({ to, ...roomOf(params.channelId) } as UserInviteBatchPayload);
    };

    return {
        createSingleInvite,
        createPlaceInvite,
        requestInviteLink,
        createBatchInvite,
        isPending: isPending['invite'] || isPending['invite-batch'],
    };
};
