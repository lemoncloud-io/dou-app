import { ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { DefaultAvatar, Divider, GroupLabel, ImageAvatar, ListRow, Switch } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { reportError, useSessionIdentity } from '@chatic/web-core';
import { toError } from '../../../utils/errors';

import { useActivePlaceName } from '../../../hooks';
import { PlaceProfileCreateDialog } from '../../../ui/components/PlaceProfileCreateDialog';
import { PlaceProfileEditDialog } from '../components/PlaceProfileEditDialog';
import { useSetMyPlaceProfile } from '../../../hooks';
import { PageHeader } from '../../../ui/components';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MemberListItem } from '../components/MemberListItem';
import { MemberProfileDialog } from '../components/MemberProfileDialog';
import { JoinNickDialog } from '../components/JoinNickDialog';
import { UpdateChannelDialog } from '../components/UpdateChannelDialog';
import {
    useChannel,
    useChannelJoins,
    useChannelMembers,
    useChannelMutations,
    useChannelProfiles,
    useChannelTitle,
    useDmPeer,
    useJoinMutations,
} from '../hooks';
import { resolveChannelAvatar } from '../lib';
import { getRoomDistance } from '../utils/roomDistance';
import { ROUTES } from '../../../routes/paths';

type DialogType = 'update' | 'delete' | 'leave' | 'profile' | 'profileSettings' | 'profileCreate' | 'joinNick' | null;

interface SelectedMember {
    id: string;
    name: string;
    avatar?: string | null;
}

export const ChannelSettingsPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const setMyPlaceProfile = useSetMyPlaceProfile();
    const { channelId } = useParams<{ channelId: string }>();
    // Settings is only ever reached from the room, so it's always 1 hop away.
    const roomDistance = getRoomDistance(useLocation().state, 1);
    const [activeDialog, setActiveDialog] = useState<DialogType>(null);
    const [selectedMember, setSelectedMember] = useState<SelectedMember | null>(null);

    const { toast } = useToast();

    const { userId } = useSessionIdentity();

    const { channel, isError } = useChannel(channelId ?? null);
    const activePlaceName = useActivePlaceName();

    // One join subscription for the screen: the member rows' read-state and my own row (the notify
    // toggle, my nick) are two readings of the same cache list — see useChannelJoins.
    const { joins, myJoin } = useChannelJoins(channelId ?? null);

    const { members, isLoading: isMembersLoading } = useChannelMembers({
        channelId: channelId || '',
        detail: true,
        // The roster names members before any per-channel sync lands — without it a self-chat shows
        // an empty "방 친구", since its one member has no user-cache row to be found by.
        memberIds: channel?.memberIds,
        joins,
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
    const { profileMap, hasSnapshot: hasProfileSnapshot } = useChannelProfiles(channel?.sid ?? null, memberUserIds);

    // Hooks must run before the `isError` early return below. DM peer (header/name display) and the
    // room title are resolved here; the plain type flags derived from them stay past the return.
    const dmPeer = useDmPeer(channel, members, profileMap, userId);
    // The same chain the room header and the home list use — settings must not invent a third one.
    const roomTitle = useChannelTitle(channel, { joinNick: myJoin?.nick, peerNick: dmPeer?.profileNick });

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
    // 1:1 DM (stereo).
    const isDmChat = channel?.stereo === 'dm';

    // One shared rule with the room header and the home list (resolveChannelAvatar): self → MY
    // place-profile photo, DM → the peer's, else the channel photo. Both self and DM ignore
    // channel.thumbnail. The same rule picks the placeholder glyph — a group room without a photo is
    // the navy circle with the two-person glyph (Figma 3164-12515), NOT the chat-bubble placeholder
    // this screen used to draw.
    const { src: roomAvatarSrc, glyph } = resolveChannelAvatar({
        channel: channel ?? {},
        myThumbnail: userId ? profileMap.get(userId)?.thumbnail : undefined,
        peerThumbnail: dmPeer?.thumbnail,
    });
    const roomAvatar = roomAvatarSrc ? (
        <ImageAvatar src={roomAvatarSrc} alt={roomTitle} size={40} />
    ) : (
        <DefaultAvatar size={40} variant={glyph} />
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
            // My own row with no place profile: prompt instead of naming me. The user-cache `name` is
            // NOT a usable fallback here — it is `***<last 4>` for a phone signup (ADR-0033 D10) or a
            // raw UUID, the very values ADR-0039 kept out of the title chain. Every stereo shares this
            // list, so the nudge is not gated on self-chat (ADR-0040).
            //
            // `hasProfileSnapshot` is load-bearing, and isMembersLoading CANNOT stand in for it: that
            // flag flips on the user cache's first emit and knows nothing about profiles, while this
            // hook is downstream of the channel row (it needs `sid`) and then does its own async
            // bootstrap. Members routinely arrive first, so reading absence from an empty profileMap
            // would nudge users who do have a profile — and the row is tappable, so a mistaken tap
            // opens a blank create form whose save overwrites the real nick.
            const needsProfileSetup =
                !!memberId && memberId === userId && hasProfileSnapshot && !memberProfile?.nick?.trim();
            const memberName = needsProfileSetup
                ? t('chat.settings.profileSetupRequired')
                : memberProfile?.nick || member.name || memberId || t('chat.settings.unknownUser');

            const memberView = {
                id: memberId,
                name: memberName,
                avatar: memberProfile?.thumbnail ?? null,
            };

            return (
                // No `isPendingInvite`: nothing in the payload can prove one. The join counter is
                // `0` for "invited, hasn't come in" AND for "left" alike (see utils/membership), so
                // badging on it labelled departed members as pending invites. Rather than guess, the
                // badge is not drawn — a missing badge on a real invitee costs far less than a wrong
                // one on someone who left. Restore it the moment the server can tell the two apart.
                <MemberListItem
                    key={memberId}
                    member={memberView}
                    isMe={memberId === userId}
                    isOwner={memberId === channel?.ownerId}
                    needsProfileSetup={needsProfileSetup}
                    // With no profile, skip the member-profile sheet and go straight to creating one —
                    // that sheet's only self action is "프로필 설정" anyway, so it would be a dead tap.
                    onClick={() => (needsProfileSetup ? openDialog('profileCreate') : openMemberProfile(memberView))}
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
                {/* Room name — tap opens the name/info dialog. Self-chat and DM edit MY join nick
                    (JoinNickDialog, private to me); groups edit channel.name (UpdateChannelDialog,
                    read-only for non-owner members). DM naming is open again — the join nick is the
                    top of its title chain, so with no way to write it that tier would be dead
                    (ADR-0039, reversing ADR-0032). */}
                <ListRow
                    leading={roomAvatar}
                    title={roomTitle}
                    trailing={<ChevronRight className="size-5 text-muted-foreground" />}
                    onClick={() => openDialog(isSelfChat || isDmChat ? 'joinNick' : 'update')}
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
                                onClick={() =>
                                    channelId &&
                                    navigate(ROUTES.channels.invite(channelId), {
                                        state: { roomDistance: roomDistance + 1 },
                                    })
                                }
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
            {/* One mount, not one per variant: the dialog fetches my profile on mount, so two
                instances cost two round-trips and only ever one of them can be open. The placeholder
                is the name the room falls back to right now, so clearing the field visibly returns
                to it — for a DM that is the title chain minus my own nick. */}
            <JoinNickDialog
                open={activeDialog === 'joinNick'}
                onOpenChange={open => (open ? openDialog('joinNick') : closeDialog())}
                channelId={channelId}
                variant={isSelfChat ? 'self' : 'dm'}
                fallbackName={isSelfChat ? undefined : dmPeer?.profileNick || channel?.name || t('chat.dm.unnamedPeer')}
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
            {/* Reached from my own member row when it has no profile yet. `exit` is supplied so a
                half-typed name still gets the unsaved-changes guard — unlike the invite paths, backing
                out here costs nothing, so there is no reason to leave silently (ADR-0040 / ADR-0041). */}
            <PlaceProfileCreateDialog
                onSubmit={setMyPlaceProfile}
                open={activeDialog === 'profileCreate'}
                placeName={activePlaceName}
                onDone={closeDialog}
                onExit={closeDialog}
                exit={{
                    title: t('placeProfileCreate.exitTitle'),
                    description: t('placeProfileCreate.exitDescription'),
                    leaveLabel: t('placeProfileCreate.exitLeave'),
                    continueLabel: t('placeProfileCreate.exitContinue'),
                }}
            />
        </div>
    );
};
