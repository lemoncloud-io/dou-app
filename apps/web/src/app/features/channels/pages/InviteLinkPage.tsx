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

/**
 * Invite link page — exposes the Location link obtained from AddFriendSheet's requestInvite, for
 * copying/sharing. The link is passed via route state; if it's lost (e.g. a reload), this returns
 * to the channel room.
 */
export const InviteLinkPage = () => {
    const navigate = useNavigateWithTransition();
    const { channelId } = useParams<{ channelId: string }>();
    const { state } = useLocation();
    const inviteLink = (state as InviteLinkState | null)?.inviteLink;
    // room -> [settings ->] invite -> here is at least 2 hops; used to pop the whole flow at once
    // (see roomDistance.ts) instead of leaving settings/invite entries stacked under this page.
    const roomDistance = getRoomDistance(state, 2);

    const { channel } = useChannel(channelId ?? null);

    // Route state carries the link; without it there is nothing to show (e.g. after a reload).
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
