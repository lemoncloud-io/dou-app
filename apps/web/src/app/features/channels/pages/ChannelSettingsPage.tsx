import { ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { runtime, type DomainPlace } from '@chatic/runtime-react';
import { useNavigateWithTransition } from '@chatic/shared';
import { DefaultAvatar, Divider, GroupLabel, IconChevronRight, ImageAvatar, ListRow, Switch } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useActivePlaceName } from '../../../hooks';
import { PlaceProfileCreateDialog } from '../../../ui/components/PlaceProfileCreateDialog';
import { PlaceProfileEditDialog } from '../components/PlaceProfileEditDialog';
import { usePlaceProfileAbsent, useSetMyPlaceProfile } from '../../../hooks';
import { PageHeader } from '../../../ui/components';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MemberListItem } from '../components/MemberListItem';
import { MemberProfileDialog } from '../components/MemberProfileDialog';
import { JoinNickDialog } from '../components/JoinNickDialog';
import { NotifyModeSheet } from '../components/NotifyModeSheet';
import { UpdateChannelDialog } from '../components/UpdateChannelDialog';
import {
    useChannel,
    useChannelJoins,
    useChannelMembers,
    useChannelMutations,
    useChannelProfiles,
    useChannelTitle,
    useChatInputLock,
    useDmInviteState,
    useDmPeer,
    useJoinMutations,
    useStartDm,
} from '../hooks';
import {
    canStartDmFromProfile,
    channelKindOf,
    dmLineageOf,
    hasDmInviteFlow,
    isRoomOwner,
    profilePlaceOf,
    removalActionFor,
    resolveChannelAvatar,
} from '../lib';
import { RoomFilesEntry } from '../components/RoomFilesEntry';
import { ChannelWebhooksSection } from '../components/ChannelWebhooksSection';
import { toCloudId } from '../../../hooks/useCloudScope';
import { NOTIFY_LEVEL_LABEL_KEY, type NotifyLevel, notifyLevelOf, notifyLevelsFor } from '../utils/notifyLevel';
import { type DisplayNameSources, resolveUserName } from '../utils/displayName';
import { divergenceReporter } from '../../../runtime/logging/divergenceReporter';
import { getRoomDistance } from '../utils/roomDistance';
import { canReinviteDm } from '../utils/dmInviteState';
import { hasLeftChannel } from '../utils/membership';
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
    const roomDistance = getRoomDistance(useLocation().state, 1);
    const [activeDialog, setActiveDialog] = useState<DialogType>(null);
    const [selectedMember, setSelectedMember] = useState<SelectedMember | null>(null);

    const { toast } = useToast();

    const { userId } = runtime.session.useSessionIdentity();
    const { isGuest } = runtime.session.useRuntimeProfile();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const { startDm, isAvailable: canStartDm } = useStartDm();

    const { channel, isError } = useChannel(channelId ?? null);
    const uidInRoomCloud = runtime.session.useUidInCloud(toCloudId(channel?.cid || selectedCloudId));
    const isMe = (memberId: string | null | undefined) =>
        !!memberId && (memberId === userId || memberId === uidInRoomCloud);
    const activePlaceName = useActivePlaceName();

    const { place: placeRepository } = runtime.data.useRuntimeRepositories();
    const roomPlaceId = channel?.sid;
    const [roomPlace, setRoomPlace] = useState<DomainPlace | null>(null);
    useEffect(() => {
        setRoomPlace(null);
        if (!roomPlaceId) return;
        return placeRepository.observeItem(roomPlaceId, setRoomPlace);
    }, [placeRepository, roomPlaceId]);
    const [isRemovingFromPlace, setIsRemovingFromPlace] = useState(false);

    const { joins, myJoin } = useChannelJoins(channelId ?? null);
    const isMemberRoomOwner = (memberId: string) =>
        isRoomOwner(
            channel,
            joins.find(join => join.userId === memberId),
            memberId
        );

    const { members, isLoading: isMembersLoading } = useChannelMembers({
        channelId: channelId || '',
        detail: true,
        memberIds: channel?.memberIds,
        joins,
        keepLeftMembers: channel?.stereo === 'dm',
    });

    const memberSourcesRef = useRef<{ memberIds?: string[]; joins: typeof joins }>({ joins: [] });
    useEffect(() => {
        memberSourcesRef.current = { memberIds: channel?.memberIds, joins };
    }, [channel?.memberIds, joins]);
    useEffect(
        () => () => {
            if (!channelId) return;
            const { memberIds, joins: rows } = memberSourcesRef.current;
            const roster = (memberIds ?? []).filter(Boolean);
            const joinedIds = new Set(rows.map(row => row.userId).filter(Boolean) as string[]);
            const activeIds = new Set(
                rows
                    .filter(row => !hasLeftChannel(row))
                    .map(row => row.userId)
                    .filter(Boolean) as string[]
            );
            divergenceReporter.member({
                channelId,
                rosterOnly: roster.filter(id => !joinedIds.has(id)).length,
                joinOnly: [...activeIds].filter(id => !roster.includes(id)).length,
                joinCount: rows.length,
                rosterKnown: memberIds !== undefined,
            });
        },
        [channelId]
    );

    const { leaveChannel, deleteChannel, isPending } = useChannelMutations();
    const { updateJoin } = useJoinMutations();

    const serverNotifyLevel = notifyLevelOf(myJoin?.notify, channel?.stereo === 'dm');
    const [notifyLevel, setNotifyLevel] = useState<NotifyLevel>(serverNotifyLevel);
    const [isNotifySheetOpen, setIsNotifySheetOpen] = useState(false);
    const inputLock = useChatInputLock(channelId);
    const handleInputLockChange = (isLocked: boolean) => {
        inputLock.setLocked(isLocked);
        toast({ title: t(isLocked ? 'chat.inputLock.locked' : 'chat.inputLock.unlocked') });
    };

    useEffect(() => {
        setNotifyLevel(serverNotifyLevel);
    }, [serverNotifyLevel]);

    const handleNotifySelect = async (next: NotifyLevel) => {
        if (!channelId || next === notifyLevel) return;

        const previous = notifyLevel;
        setNotifyLevel(next);
        try {
            const { delivered } = await updateJoin({
                channelId,
                userId: myJoin?.userId ?? userId,
                notify: next,
            } as never);
            delivered.catch(() => toast({ title: t('chat.settings.notifyFailed'), variant: 'destructive' }));
        } catch (error) {
            setNotifyLevel(previous);
            logger.error('CHAT', 'Failed to update room notification', { error, data: { channelId } });
            toast({ title: t('chat.settings.notifyFailed'), variant: 'destructive' });
        }
    };

    const openMemberProfile = (member: SelectedMember) => {
        setSelectedMember(member);
        setActiveDialog('profile');
    };

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
            toast({ title: t('chat.settings.kickFailed'), variant: 'destructive' });
        }
    };

    const handleRemoveFromPlace = async () => {
        if (!roomPlaceId || !selectedMember) return;

        setIsRemovingFromPlace(true);
        try {
            await placeRepository.removeMember(roomPlaceId, selectedMember.id);
            closeDialog();
            toast({ title: t('chat.settings.kicked') });
        } catch (error) {
            logger.error('place.remove_member', 'Failed to remove a place member from a room profile', {
                error,
                data: { placeId: roomPlaceId, channelId, userId: selectedMember.id },
            });
            toast({ title: t('chat.settings.kickFailed'), variant: 'destructive' });
        } finally {
            setIsRemovingFromPlace(false);
        }
    };

    const memberUserIds = useMemo(() => members.map(m => m.id).filter((id): id is string => !!id), [members]);
    const profilePlace = profilePlaceOf(channel, selectedSiteId);
    const { profileMap } = useChannelProfiles(profilePlace, memberUserIds);
    const { absent: myProfileAbsent, markPresent: markMyProfilePresent } = usePlaceProfileAbsent();
    const isRoomInActivePlace = !!profilePlace && profilePlace === selectedSiteId;

    const dmPeer = useDmPeer(channel, members, profileMap, userId);
    const roomTitle = useChannelTitle(channel, {
        joinNick: myJoin?.nick,
        peerNick: dmPeer?.profileNick,
        peerCloudName: dmPeer?.cloudName,
    });
    const { state: dmInviteState, resolveReinvitePrefill } = useDmInviteState({
        channelId: channelId ?? null,
        hasInviteFlow: hasDmInviteFlow(channel),
        peerId: dmPeer?.id,
        joins,
        channel,
        userId,
    });

    const openDialog = (type: DialogType) => setActiveDialog(type);
    const closeDialog = () => setActiveDialog(null);

    const handleLeaveRoom = async () => {
        if (!channelId) return;

        try {
            await leaveChannel({ channelId });
            closeDialog();
            toast({ title: t('chat.settings.leftRoomToast') });
            navigate(ROUTES.root, { replace: true });
        } catch (error) {
            logger.error('CHAT', 'Failed to leave room', { error, data: { channelId } });
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
    const isDmChat = channel?.stereo === 'dm';
    const isCloudDm = dmLineageOf(channel) === 'cloud';
    const nameEditor: DialogType = isSelfChat || isDmChat ? (isCloudDm ? null : 'joinNick') : isOwner ? 'update' : null;
    const removal = removalActionFor(channelKindOf(channel?.stereo), isOwner);
    const canRemoveTarget =
        channelKindOf(channel?.stereo) === 'group' &&
        !!selectedMember &&
        !isMe(selectedMember.id) &&
        !isMemberRoomOwner(selectedMember.id);

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

    const memberById = useMemo(() => {
        const map = new Map<string, (typeof members)[number]>();
        for (const member of members) if (member.id) map.set(member.id, member);
        return map;
    }, [members]);

    const nameSources: DisplayNameSources = useMemo(
        () => ({
            profileMap,
            memberById,
            userId,
            unknownLabel: t('chat.unknownUser'),
            meLabel: t('chat.me'),
        }),
        [profileMap, memberById, userId, t]
    );

    const memberList = isMembersLoading ? (
        <div className="py-4 text-center text-sm text-muted-foreground">{t('chat.settings.loading')}</div>
    ) : members.length > 0 ? (
        members.map(member => {
            const memberId = member.id ?? '';
            const memberProfile = memberId ? profileMap.get(memberId) : undefined;
            const needsProfileSetup =
                !!memberId &&
                memberId === userId &&
                isRoomInActivePlace &&
                myProfileAbsent === true &&
                !memberProfile?.nick?.trim();
            const memberName = needsProfileSetup
                ? t('chat.settings.profileSetupRequired')
                : resolveUserName(memberId, nameSources);

            const memberView = {
                id: memberId,
                name: memberName,
                avatar: memberProfile?.thumbnail ?? null,
            };

            return (
                <MemberListItem
                    key={memberId}
                    member={memberView}
                    isMe={isMe(memberId)}
                    isOwner={isMemberRoomOwner(memberId)}
                    needsProfileSetup={needsProfileSetup}
                    hasLeft={hasLeftChannel(member.$join)}
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
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('chat.settings.title')} />

            <div className="flex flex-1 flex-col overflow-y-auto pb-safe-bottom">
                <ListRow
                    leading={roomAvatar}
                    title={roomTitle}
                    trailing={nameEditor ? <ChevronRight className="size-5 text-muted-foreground" /> : undefined}
                    onClick={nameEditor ? () => openDialog(nameEditor) : undefined}
                />

                {channelId && <RoomFilesEntry cid={toCloudId(channel?.cid || selectedCloudId)} channelId={channelId} />}

                {isSelfChat ? (
                    <>
                        <GroupLabel label={t('chat.settings.roomMembers')} />
                        {memberList}
                    </>
                ) : (
                    <>
                        <GroupLabel label={t('chat.settings.roomSettingsGroup')} />
                        <ListRow
                            title={t('chat.settings.roomNotification')}
                            trailing={
                                <span className="flex items-center gap-1">
                                    <span className="text-[14px] text-description">
                                        {t(NOTIFY_LEVEL_LABEL_KEY[notifyLevel])}
                                    </span>
                                    <IconChevronRight className="size-[18px] text-description" />
                                </span>
                            }
                            onClick={() => setIsNotifySheetOpen(true)}
                        />
                        {inputLock.isAvailable && (
                            <ListRow
                                title={t('chat.inputLock.settingsRow')}
                                trailing={
                                    <Switch
                                        checked={inputLock.isLocked}
                                        onCheckedChange={handleInputLockChange}
                                        label={t('chat.inputLock.settingsRow')}
                                    />
                                }
                            />
                        )}

                        <GroupLabel label={t('chat.settings.roomMembers')} />
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

                        {isOwner && !isDmChat && channelId && <ChannelWebhooksSection channelId={channelId} />}

                        <Divider variant="block" className="my-2" />
                        <ListRow
                            destructive
                            title={removal === 'delete' ? t('chat.settings.deleteRoom') : t('chat.settings.leaveRoom')}
                            onClick={() => openDialog(removal === 'delete' ? 'delete' : 'leave')}
                        />
                    </>
                )}
            </div>

            <NotifyModeSheet
                open={isNotifySheetOpen}
                onOpenChange={setIsNotifySheetOpen}
                value={notifyLevel}
                levels={notifyLevelsFor(isDmChat)}
                onSelect={handleNotifySelect}
            />
            <UpdateChannelDialog
                open={activeDialog === 'update'}
                onOpenChange={open => (open ? openDialog('update') : closeDialog())}
                channelId={channelId}
            />
            <JoinNickDialog
                open={activeDialog === 'joinNick'}
                onOpenChange={open => (open ? openDialog('joinNick') : closeDialog())}
                channelId={channelId}
                variant={isSelfChat ? 'self' : 'dm'}
                fallbackName={isSelfChat ? undefined : dmPeer?.profileNick || channel?.name || t('chat.dm.unnamedPeer')}
                peerThumbnail={dmPeer?.thumbnail}
                peerHasLeft={dmInviteState.kind !== 'present'}
                onReinvite={
                    isDmChat && !isGuest && channelId && canReinviteDm(dmInviteState)
                        ? () => {
                              const prefill = resolveReinvitePrefill();
                              navigate(ROUTES.invite.contact, {
                                  state: {
                                      reinvite: {
                                          channelId,
                                          name: prefill.name ?? dmPeer?.profileNick,
                                          phone: prefill.phone,
                                      },
                                  },
                              });
                          }
                        : undefined
                }
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
                title={t(isDmChat ? 'chat.settings.dmLeaveDialog.title' : 'chat.settings.leaveDialog.title')}
                description={t(
                    isDmChat ? 'chat.settings.dmLeaveDialog.description' : 'chat.settings.leaveDialog.description'
                )}
                confirmLabel={t(isDmChat ? 'chat.settings.dmLeaveDialog.confirm' : 'chat.settings.leaveDialog.confirm')}
                onConfirm={handleLeaveRoom}
                isPending={isPending.leave}
                variant="warning"
            />
            <MemberProfileDialog
                open={activeDialog === 'profile'}
                onOpenChange={open => (open ? openDialog('profile') : closeDialog())}
                member={selectedMember}
                memberIsOwner={!!selectedMember && isMemberRoomOwner(selectedMember.id)}
                isSelf={!!selectedMember && isMe(selectedMember.id)}
                canKick={canRemoveTarget && isOwner}
                onKick={handleKickMember}
                roomName={roomTitle}
                canRemoveFromPlace={canRemoveTarget && !!roomPlace?.isOwner && selectedMember?.id !== roomPlace.ownerId}
                onRemoveFromPlace={handleRemoveFromPlace}
                placeName={roomPlace?.name}
                isKicking={isPending.leave || isRemovingFromPlace}
                onOpenProfileSettings={() => openDialog('profileSettings')}
                onStartDm={
                    canStartDm &&
                    selectedMember &&
                    canStartDmFromProfile({
                        room: channel,
                        sessionCloudId: selectedCloudId,
                        sessionPlaceId: selectedSiteId,
                        memberId: selectedMember.id,
                        isMe,
                    })
                        ? () => {
                              const peerId = selectedMember.id;
                              closeDialog();
                              void startDm(peerId);
                          }
                        : undefined
                }
            />
            <PlaceProfileEditDialog
                open={activeDialog === 'profileSettings'}
                placeName={activePlaceName}
                onClose={closeDialog}
                profileAbsent={myProfileAbsent}
            />
            <PlaceProfileCreateDialog
                onSubmit={setMyPlaceProfile}
                open={activeDialog === 'profileCreate'}
                placeName={activePlaceName}
                onDone={() => {
                    markMyProfilePresent();
                    closeDialog();
                }}
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
