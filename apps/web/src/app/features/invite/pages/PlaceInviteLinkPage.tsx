import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import type { DomainPlace } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';

import { ROUTES } from '../../../routes/paths';
import { InviteLinkView } from '../../channels/components/InviteLinkView';

/** home → place invite → here: closing pops both, back to home. */
const FLOW_DEPTH = 2;

/**
 * The place invite's link screen — the room invite's link screen, naming the place. The link rides
 * in route state; if it is lost (a reload), there is nothing to show and this goes home.
 */
export const PlaceInviteLinkPage = () => {
    const navigate = useNavigateWithTransition();
    const { placeId } = useParams<{ placeId: string }>();
    const inviteLink = (useLocation().state as { inviteLink?: string } | null)?.inviteLink;
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();

    const [place, setPlace] = useState<DomainPlace | null>(null);
    useEffect(() => {
        if (!placeId) return;
        return placeRepository.observeItem(placeId, setPlace);
    }, [placeRepository, placeId]);

    useEffect(() => {
        if (!inviteLink) navigate(ROUTES.home, { replace: true });
    }, [inviteLink, navigate]);

    if (!inviteLink) return null;

    return (
        <InviteLinkView
            inviteLink={inviteLink}
            name={place?.name ?? ''}
            avatarSrc={place?.thumbnail ?? undefined}
            onClose={() => navigate(-FLOW_DEPTH)}
        />
    );
};
