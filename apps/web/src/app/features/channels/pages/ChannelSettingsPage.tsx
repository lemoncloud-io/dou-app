import { ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { ChatAvatar, DefaultAvatar, Divider, GroupLabel, ImageAvatar, ListRow, Switch } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { reportError, useSessionIdentity } from '@chatic/web-core';
import { toError } from '../../../utils/errors';

import { useActivePlaceName } from '../../../hooks';
import { PlaceProfileEditDialog } from '../../home/components';
import { PageHeader } from '../../../ui/components';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MemberListItem } from '../components/MemberListItem';
import { MemberProfileDialog } from '../components/MemberProfileDialog';
import { SelfChatNameDialog } from '../components/SelfChatNameDialog';
import { UpdateChannelDialog } from '../components/UpdateChannelDialog';
import {
    useChannel,
    useChannelMembers,
    useChannelMutations,
    useChannelProfiles,
    useDmPeer,
    useJoinMutations,
    useMyJoin,
    useSelfChatTitle,
} from '../hooks';
import { ROUTES } from '../../../routes/paths';

type DialogType = 'update' | 'delete' | 'leave' | 'profile' | 'profileSettings' | 'selfName' | null;

interface SelectedMember {
    id: string;
    name: string;
    avatar?: string | null;
}

export const ChannelSettingsPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { channelId } = useParams<{ channelId: string }>();
    const [activeDialog, setActiveDialog] = useState<DialogType>(null);
    const [selectedMember, setSelectedMember] = useState<SelectedMember | null>(null);

    const { toast } = useToast();

    const { userId } = useSessionIdentity();

    const { channel, isError } = useChannel(channelId ?? null);
    const activePlaceName = useActivePlaceName();

    const { members, isLoading: isMembersLoading } = useChannelMembers({
        channelId: channelId || '',
        detail: true,
    });

    const { leaveChannel, deleteChannel, isPending } = useChannelMutations();
    const { updateJoin } = useJoinMutations();

    // Chat-notification toggle backed by join.update (ADR-0025). The mute state
    // lives on my join row (`notify`), not the channel — so read it from the join
    // cache stream, not the channel's embedded `$join` (a lagging projection).
    // 'none' means muted, anything else means on. apps/web has no client-side
    // notifier, so we trust the server value and keep a local optimistic mirror
    // for instant feedback (updateJoin's optimistic write lands on the join cache
    // too, so this reconciles from the same source).
    const myJoin = useMyJoin(channelId ?? null);
    const serverNotify = myJoin?.notify;
    const [notifyEnabled, setNotifyEnabled] = useState(serverNotify !== 'none');

    // Reconcile with the join stream once it hydrates (or changes from another
    // device). myJoin is null on first render, so this seeds it too.
    useEffect(() => {
        setNotifyEnabled(serverNotify !== 'none');
    }, [serverNotify]);

    const handleNotifyChange = async (next: boolean) => {
        if (!channelId) return;

        const previous = notifyEnabled;
        setNotifyEnabled(next); // optimistic — revert on failure below
        try {
            // ChannelUpdateJoinInput types only channelId/notify; the engine resolves
            // the join row from channelId + userId at write time, so pass userId via a cast.
            await updateJoin({
                channelId,
                userId: myJoin?.userId ?? userId,
                notify: next ? 'all' : 'none',
            } as never);
        } catch (error) {
            setNotifyEnabled(previous);
            logger.error('CHAT', 'Failed to update room notification', { error, data: { channelId } });
            reportError(toError(error));
            toast({ title: t('chat.settings.notifyFailed'), variant: 'destructive' });
        }
    };

    const openMemberProfile = (member: SelectedMember) => {
        setSelectedMember(member);
        setActiveDialog('profile');
    };

    // Owner-only kick: leaveChannel with a target userId removes that member.
    const handleKickMember = async () => {
        if (!channelId || !selectedMember) return;

        try {
            await leaveChannel({ channelId, userId: selectedMember.id });
            closeDialog();
            toast({ title: t('chat.settings.kicked') });
        } catch (error) {
            logger.error('CHAT', 'Failed to remove member', {
                error,
                data: { channelId, userId: selectedMember.id },
            });
            reportError(toError(error));
            toast({ title: t('chat.settings.kickFailed'), variant: 'destructive' });
        }
    };

    // Site profiles (nick/avatar) for the member list; same source as the room.
    const memberUserIds = useMemo(() => members.map(m => m.id).filter((id): id is string => !!id), [members]);
    const { profileMap } = useChannelProfiles(channel?.sid ?? null, memberUserIds);

    // Hooks must run before the `isError` early return below. DM peer (header/name display) and the
    // self-chat title are resolved here; the plain type flags derived from them stay past the return.
    const dmPeer = useDmPeer(channel, members, profileMap, userId);
    // Self-chat name comes from the per-user join nick, not `channel.name` (ADR-0022).
    const selfChatTitle = useSelfChatTitle(channel);

    const openDialog = (type: DialogType) => setActiveDialog(type);
    const closeDialog = () => setActiveDialog(null);

    const handleLeaveRoom = async () => {
        if (!channelId) return;

        try {
            await leaveChannel({ channelId });
            closeDialog();
            toast({ title: t('chat.settings.leftRoom') });
            navigate(ROUTES.root, { replace: true });
        } catch (error) {
            logger.error('CHAT', 'Failed to leave room', { error, data: { channelId } });
            reportError(toError(error));
            toast({ title: t('chat.settings.leaveFailed'), variant: 'destructive' });
        }
    };

    const handleDeleteRoom = async () => {
        if (!channelId) return;

        try {
            await deleteChannel({ channelId });
            closeDialog();
            toast({ title: t('chat.settings.deletedRoom') });
            navigate(ROUTES.root, { replace: true });
        } catch (error) {
            logger.error('CHAT', 'Failed to delete room', { error, data: { channelId } });
            reportError(toError(error));
            toast({ title: t('chat.settings.deleteFailed'), variant: 'destructive' });
        }
    };

    if (isError) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="text-center">
                    <div className="text-sm text-destructive">{t('chat.settings.error')}</div>
                    <button onClick={() => navigate(-1)} className="mt-2 text-sm text-primary underline">
                        {t('chat.settings.goBack')}
                    </button>
                </div>
            </div>
        );
    }

    const isSelfChat = !!channel?.isSelfChat;
    const isOwner = !!channel?.isOwner;
    // 1:1 DM (stereo): the room name is the peer and cannot be renamed (ADR-0032).
    const isDmChat = channel?.stereo === 'dm';
    // Title by channel type: self → selfChatTitle; dm → the peer's nick (ADR-0032). The rest —
    // I own it → the owner-set channel.name (my own join nick is ignored); I'm a member → my join
    // nick, falling back to channel.name.
    const roomTitle = isSelfChat
        ? selfChatTitle
        : isDmChat
          ? dmPeer?.nick || t('chat.settings.roomName')
          : (isOwner ? channel?.name : (myJoin?.nick ?? channel?.name)) || t('chat.settings.roomName');

    // DM always shows the peer avatar (matching the room header) — channel.thumbnail is ignored for
    // DM. Otherwise: channel thumbnail → self glyph → group placeholder.
    const roomAvatar = isDmChat ? (
        dmPeer?.thumbnail ? (
            <ImageAvatar src={dmPeer.thumbnail} alt={dmPeer.nick} size={40} />
        ) : (
            <DefaultAvatar size={40} variant="user" />
        )
    ) : channel?.thumbnail ? (
        <ImageAvatar src={channel.thumbnail} alt={channel?.name ?? ''} size={40} />
    ) : isSelfChat ? (
        <DefaultAvatar size={40} variant="self" />
    ) : (
        <ChatAvatar size="sm" />
    );

    // Member rows — shared by the group section and the self-chat "방 친구" section
    // (where the only member is me/the owner).
    const memberList = isMembersLoading ? (
        <div className="py-4 text-center text-sm text-muted-foreground">{t('chat.settings.loading')}</div>
    ) : members.length > 0 ? (
        members.map(member => {
            const memberId = member.id ?? '';
            // Site profile (nick/avatar) takes precedence over the user-cache name.
            const memberProfile = memberId ? profileMap.get(memberId) : undefined;
            const memberName = memberProfile?.nick || member.name || memberId || t('chat.settings.unknownUser');

            const memberView = {
                id: memberId,
                name: memberName,
                avatar: memberProfile?.thumbnail ?? null,
            };

            return (
                <MemberListItem
                    key={memberId}
                    member={memberView}
                    isMe={memberId === userId}
                    isOwner={memberId === channel?.ownerId}
                    isPendingInvite={member.$join?.joined === 0}
                    onClick={() => openMemberProfile(memberView)}
                />
            );
        })
    ) : (
        <div className="py-4 text-center text-sm text-muted-foreground">
            {t('chat.settings.noMembers', 'No members')}
        </div>
    );

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={t('chat.settings.title')} />

            {/* Content — scrolls when the member list grows past the viewport. */}
            <div className="flex flex-1 flex-col overflow-y-auto pb-safe-bottom">
                {/* Room name — tap opens the name/info dialog. Self-chat edits the join
                    nick (SelfChatNameDialog); groups edit channel.name (UpdateChannelDialog,
                    read-only for non-owner members). DM is not editable: the name is the peer,
                    so the row is static (no chevron, no tap) (ADR-0032). */}
                <ListRow
                    leading={roomAvatar}
                    title={roomTitle}
                    trailing={isDmChat ? undefined : <ChevronRight className="size-5 text-muted-foreground" />}
                    onClick={isDmChat ? undefined : () => openDialog(isSelfChat ? 'selfName' : 'update')}
                />

                {isSelfChat ? (
                    /* Self-chat: only the "방 친구" section (just me/the owner). No
                       notification, friend-add, or leave/delete. */
                    <>
                        <GroupLabel label={t('chat.settings.roomMembers')} />
                        {memberList}
                    </>
                ) : (
                    <>
                        {/* Chat settings */}
                        <GroupLabel label={t('chat.settings.roomSettingsGroup')} />
                        <ListRow
                            title={t('chat.settings.roomNotification')}
                            trailing={
                                <Switch
                                    checked={notifyEnabled}
                                    onCheckedChange={handleNotifyChange}
                                    label={t('chat.settings.roomNotification')}
                                />
                            }
                        />

                        {/* Room members */}
                        <GroupLabel label={t('chat.settings.roomMembers')} />
                        {/* Add-friend is group-only — a DM is a fixed 1:1, so it never invites (ADR-0032). */}
                        {isOwner && !isDmChat && (
                            <ListRow
                                leading={
                                    <span className="flex size-10 items-center justify-center">
                                        <Plus className="size-6 text-primary" />
                                    </span>
                                }
                                title={<span className="text-primary">{t('chat.settings.addFriend')}</span>}
                                onClick={() => channelId && navigate(ROUTES.channels.invite(channelId))}
                            />
                        )}
                        {memberList}

                        {/* Destructive action — owner deletes the room, members leave it. */}
                        <Divider variant="block" className="my-2" />
                        <ListRow
                            destructive
                            title={isOwner ? t('chat.settings.deleteRoom') : t('chat.settings.leaveRoom')}
                            onClick={() => openDialog(isOwner ? 'delete' : 'leave')}
                        />
                    </>
                )}
            </div>

            {/* Dialogs */}
            <UpdateChannelDialog
                open={activeDialog === 'update'}
                onOpenChange={open => (open ? openDialog('update') : closeDialog())}
                channelId={channelId}
            />
            <SelfChatNameDialog
                open={activeDialog === 'selfName'}
                onOpenChange={open => (open ? openDialog('selfName') : closeDialog())}
                channelId={channelId}
            />
            <ConfirmDialog
                open={activeDialog === 'delete'}
                onOpenChange={open => (open ? openDialog('delete') : closeDialog())}
                title={t('chat.settings.deleteDialog.title')}
                description={t('chat.settings.deleteDialog.description')}
                confirmLabel={t('chat.settings.deleteDialog.confirm')}
                onConfirm={handleDeleteRoom}
                isPending={isPending.delete}
                variant="danger"
            />
            <ConfirmDialog
                open={activeDialog === 'leave'}
                onOpenChange={open => (open ? openDialog('leave') : closeDialog())}
                title={t('chat.settings.leaveDialog.title')}
                description={t('chat.settings.leaveDialog.description')}
                confirmLabel={t('chat.settings.leaveDialog.confirm')}
                onConfirm={handleLeaveRoom}
                isPending={isPending.leave}
                variant="warning"
            />
            <MemberProfileDialog
                open={activeDialog === 'profile'}
                onOpenChange={open => (open ? openDialog('profile') : closeDialog())}
                member={selectedMember}
                memberIsOwner={!!selectedMember && selectedMember.id === channel?.ownerId}
                isSelf={!!selectedMember && selectedMember.id === userId}
                canKick={
                    isOwner &&
                    // DM has no kick — a 1:1 ends via delete (owner) / leave (peer), never by
                    // removing the peer into a lone-member room (ADR-0032).
                    !isDmChat &&
                    !!selectedMember &&
                    selectedMember.id !== channel?.ownerId &&
                    selectedMember.id !== userId
                }
                onKick={handleKickMember}
                isKicking={isPending.leave}
                onOpenProfileSettings={() => openDialog('profileSettings')}
            />
            <PlaceProfileEditDialog
                open={activeDialog === 'profileSettings'}
                placeName={activePlaceName}
                onClose={closeDialog}
            />
        </div>
    );
};
