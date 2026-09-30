import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import type { DomainPlace } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';

import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { resolvePlaceInviteGate } from '../../../utils/placeInviteGate';
// Direct paths, not the channels barrels: the room invite's contact picker, link sheet and hook are
// what this page reuses, and the barrels would pull the whole room feature in with them.
import { AddFriendSheet } from '../../channels/components/AddFriendSheet';
import { ContactInviteTab } from '../../channels/components/ContactInviteTab';
import { useCreateInviteBatch } from '../../channels/hooks/useCreateInviteBatch';

/** The same cap the room invite puts on one confirm. */
const MAX_INVITE_SELECTION = 100;

/**
 * Invite people into a cloud place without a room — the home profile menu's "invite to place".
 *
 * It is the room invite's contact tab, bound to the place instead of a room: device contacts on the
 * app (one person → the SMS composer, several → a server-sent batch), a name-and-number link sheet
 * on the web or past the list. Every invite goes out with no `channelId`, so accepting joins the
 * place and nothing else.
 *
 * The packet carries no site either: the server files the invite under the site the session is
 * sitting on. That is why the route names the place and every send re-checks it against the session
 * — a place switch between opening this page and confirming (another tab, a push) would otherwise
 * invite people somewhere the screen never said.
 */
export const PlaceInvitePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();
    const { isGuest } = runtime.session.useRuntimeProfile();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const { createPlaceInvite, createBatchInvite, requestInviteLink } = useCreateInviteBatch();
    const [addFriendOpen, setAddFriendOpen] = useState(false);

    // `undefined` until the cache has answered once, so "not loaded" and "no such place" differ.
    const [place, setPlace] = useState<DomainPlace | null | undefined>(undefined);
    useEffect(() => {
        setPlace(undefined);
        if (!placeId) {
            setPlace(null);
            return;
        }
        return placeRepository.observeItem(placeId, setPlace);
    }, [placeRepository, placeId]);

    const gate = resolvePlaceInviteGate({
        isDefaultCloud: selectedCloudId === 'default',
        isGuest,
        place,
        sessionSiteId: selectedSiteId,
    });

    // The menu entry is hidden for anyone who cannot invite here; a direct visit is sent back, the
    // same defensive backstop PlaceEditPage keeps for its owner-only screen.
    useEffect(() => {
        if (place !== undefined && gate === 'hidden') navigate(ROUTES.home, { replace: true });
    }, [place, gate, navigate]);

    /**
     * Refuses to send unless the session is on this place right now. It throws rather than returning
     * quietly: the contact tab and the link sheet both toast a thrown message and keep the user where
     * they are, which is the behaviour wanted here.
     */
    const ensureReady = () => {
        if (gate !== 'ready') throw new Error(t('placeInvite.placeChanged'));
    };
    const placeName = place?.name ?? '';

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('placeInvite.title')} />

            <ContactInviteTab
                active
                maxSelection={MAX_INVITE_SELECTION}
                sendSingle={async recipient => {
                    ensureReady();
                    return (await createPlaceInvite({ ...recipient, placeName })).channel;
                }}
                sendBatch={async phones => {
                    ensureReady();
                    return createBatchInvite({ phones });
                }}
                onSent={() => navigate(-1)}
                onRequestLink={() => setAddFriendOpen(true)}
                webGuideDescription={t('placeInvite.webGuideDescription')}
            />

            <AddFriendSheet
                open={addFriendOpen}
                onOpenChange={setAddFriendOpen}
                heading={[t('placeInvite.sheetHeading1'), t('placeInvite.sheetHeading2')]}
                requestLink={
                    placeId
                        ? async recipient => {
                              ensureReady();
                              return requestInviteLink(recipient);
                          }
                        : undefined
                }
                onLinkReady={inviteLink =>
                    placeId && navigate(ROUTES.invite.placeLink(placeId), { state: { inviteLink } })
                }
            />
        </div>
    );
};
