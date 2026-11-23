import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { AlertDialog, SegmentedTabs } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { useChannel, useCreateInviteBatch } from '../hooks';
import { AddFriendSheet } from '../components/AddFriendSheet';
import { ContactInviteTab } from '../components/ContactInviteTab';
import { PlaceInviteTab } from '../components/PlaceInviteTab';
import { getRoomDistance } from '../utils/roomDistance';

const MAX_ROOM_MEMBERS = 100;

type InviteTab = 'place' | 'contact';

export const InvitePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { channelId } = useParams<{ channelId: string }>();
    const roomDistance = getRoomDistance(useLocation().state, 1);

    const [activeTab, setActiveTab] = useState<InviteTab>('place');
    const { channel } = useChannel(channelId ?? null);
    const [addFriendOpen, setAddFriendOpen] = useState(false);
    const [limitNoticeOpen, setLimitNoticeOpen] = useState(false);

    const maxSelection = Math.max(0, MAX_ROOM_MEMBERS - (channel?.memberCount ?? 0));
    const showLimitNotice = () => setLimitNoticeOpen(true);

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

            {!isContactTab && channelId && (
                <PlaceInviteTab
                    channelId={channelId}
                    sid={channel?.sid ?? null}
                    maxSelection={maxSelection}
                    onLimitReached={showLimitNotice}
                />
            )}

            {channelId && (
                <ContactInviteTab
                    active={isContactTab}
                    maxSelection={maxSelection}
                    onLimitReached={showLimitNotice}
                    sendSingle={async recipient => (await createSingleInvite({ channelId, ...recipient })).channel}
                    sendBatch={phones => createBatchInvite({ channelId, phones })}
                    onSent={() => navigate(-1)}
                    onRequestLink={() => setAddFriendOpen(true)}
                />
            )}

            <AlertDialog
                open={limitNoticeOpen}
                onOpenChange={setLimitNoticeOpen}
                title={t('chat.settings.memberLimit.message')}
                confirmLabel={t('chat.settings.memberLimit.confirm')}
                onConfirm={() => setLimitNoticeOpen(false)}
            />

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
