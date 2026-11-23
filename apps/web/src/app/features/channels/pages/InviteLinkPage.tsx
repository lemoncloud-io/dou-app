import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';

import { ROUTES } from '../../../routes/paths';
import { useChannel } from '../hooks';
import { InviteLinkView } from '../components/InviteLinkView';
import { getRoomDistance } from '../utils/roomDistance';

interface InviteLinkState {
    inviteLink?: string;
}

export const InviteLinkPage = () => {
    const navigate = useNavigateWithTransition();
    const { channelId } = useParams<{ channelId: string }>();
    const { state } = useLocation();
    const inviteLink = (state as InviteLinkState | null)?.inviteLink;
    const roomDistance = getRoomDistance(state, 2);

    const { channel } = useChannel(channelId ?? null);

    useEffect(() => {
        if (!inviteLink && channelId) {
            navigate(ROUTES.channels.room(channelId), { replace: true });
        }
    }, [inviteLink, channelId, navigate]);

    if (!inviteLink) return null;

    return (
        <InviteLinkView
            inviteLink={inviteLink}
            name={channel?.name ?? ''}
            avatarSrc={channel?.thumbnail ?? undefined}
            onClose={() => navigate(-roomDistance)}
        />
    );
};
