import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { runtime, type DomainPlace } from '@chatic/runtime';
import { useNavigateWithTransition } from '@chatic/shared';

import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { resolvePlaceInviteGate } from '../../../utils/placeInviteGate';
import { usePlaceInviteExperiment } from '../../../hooks/usePlaceInviteExperiment';
import { AddFriendSheet } from '../../channels/components/AddFriendSheet';
import { ContactInviteTab } from '../../channels/components/ContactInviteTab';
import { useCreateInviteBatch } from '../../channels/hooks/useCreateInviteBatch';

const MAX_INVITE_SELECTION = 100;

export const PlaceInvitePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();
    const { isGuest } = runtime.session.useRuntimeProfile();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const { createPlaceInvite, createBatchInvite, requestInviteLink } = useCreateInviteBatch();
    const { isEnabled: isExperimentEnabled } = usePlaceInviteExperiment();
    const [addFriendOpen, setAddFriendOpen] = useState(false);

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
        isExperimentEnabled,
        isDefaultCloud: selectedCloudId === 'default',
        isGuest,
        place,
        sessionSiteId: selectedSiteId,
    });

    useEffect(() => {
        if ((place !== undefined || !isExperimentEnabled) && gate === 'hidden') {
            navigate(ROUTES.home, { replace: true });
        }
    }, [place, gate, isExperimentEnabled, navigate]);

    const ensureReady = () => {
        if (gate !== 'ready') throw new Error(t('placeInvite.placeChanged'));
        const sessionSiteId = runtime.session.getCommittedSessionSiteId();
        if (sessionSiteId && sessionSiteId !== placeId) throw new Error(t('placeInvite.placeChanged'));
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
