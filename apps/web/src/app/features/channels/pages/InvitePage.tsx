import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { SegmentedTabs } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { useChannel, useCreateInviteBatch } from '../hooks';
import { AddFriendSheet } from '../components/AddFriendSheet';
import { ContactInviteTab } from '../components/ContactInviteTab';
import { PlaceInviteTab } from '../components/PlaceInviteTab';
import { getRoomDistance } from '../utils/roomDistance';

/** A single invite batch selects at most this many friends. Shared with the place tab. */
const MAX_INVITE_SELECTION = 100;

type InviteTab = 'place' | 'contact';

/**
 * The channel friend-invite page — converted from the previous InviteFriendsDialog into a
 * routed page.
 * Native: multi-select device contacts for a batch invite. Web: no contacts access → funneled
 * into the invite-link flow. The contact tab itself is `ContactInviteTab`, shared with the place
 * invite; this page binds it to the channel.
 */
export const InvitePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { channelId } = useParams<{ channelId: string }>();
    // Reached from the room directly (1 hop) or via settings (2); default to the direct case.
    const roomDistance = getRoomDistance(useLocation().state, 1);

    // Place first: most people worth adding are already here, and on web the contact tab is only a
    // link-invite prompt (there is no device contacts access). See ADR-0075.
    const [activeTab, setActiveTab] = useState<InviteTab>('place');
    const { channel } = useChannel(channelId ?? null);
    const [addFriendOpen, setAddFriendOpen] = useState(false);

    const { createSingleInvite, createBatchInvite, requestInviteLink } = useCreateInviteBatch();

    const tabs = [
        { id: 'place', label: t('inviteFriends.tabPlace') },
        { id: 'contact', label: t('inviteFriends.tabContact') },
    ];
    const isContactTab = activeTab === 'contact';

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('inviteFriends.selectTitle')} />

            <SegmentedTabs items={tabs} value={activeTab} onChange={id => setActiveTab(id as InviteTab)} />

            {/* Each tab keeps its own selection and its own confirm action, so they are separate
                subtrees rather than one body with a switch inside — see ADR-0075. */}
            {!isContactTab && channelId && (
                <PlaceInviteTab channelId={channelId} sid={channel?.sid ?? null} maxSelection={MAX_INVITE_SELECTION} />
            )}

            {channelId && (
                <ContactInviteTab
                    active={isContactTab}
                    maxSelection={MAX_INVITE_SELECTION}
                    sendSingle={async recipient => (await createSingleInvite({ channelId, ...recipient })).channel}
                    sendBatch={phones => createBatchInvite({ channelId, phones })}
                    onSent={() => navigate(-1)}
                    onRequestLink={() => setAddFriendOpen(true)}
                />
            )}

            <AddFriendSheet
                open={addFriendOpen}
                onOpenChange={setAddFriendOpen}
                requestLink={channelId ? recipient => requestInviteLink({ channelId, ...recipient }) : undefined}
                onLinkReady={inviteLink =>
                    channelId &&
                    navigate(ROUTES.channels.inviteLink(channelId), {
                        state: { inviteLink, roomDistance: roomDistance + 1 },
                    })
                }
            />
        </div>
    );
};
