import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { runtime, type DomainChannel, type DomainChat } from '@chatic/runtime-react';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { Badge, Button, DefaultAvatar, ImageAvatar, ManageChannelItem } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui';
import { placeScopeKey, usePinnedChannels } from '@chatic/shared';
import { DEFAULT_CHANNEL_SORT } from '../../../stores/preferenceKeys';
import { ConfirmDialog } from '../../channels/components';
import { useChannelMutations, useDmPeers, type DmPeer } from '../../channels/hooks';
import {
    useActiveCloudData,
    useChannelSort,
    useHomeChannels,
    useJoinSyncRegistration,
    useLastActivities,
    useLastChats,
    useMyProfile,
} from '../../../hooks';
import {
    channelKindOf,
    isRoomOwner,
    removalActionFor,
    resolveChannelAvatar,
    resolveChannelTitle,
} from '../../channels/lib';
import { sortChannels } from '../../../utils/sortChannels';
import { useNavigateWithTransition } from '@chatic/shared';
import { toCloudId } from '../../../hooks/useCloudScope';
import { ROUTES } from '../../../routes/paths';
import { InviteChannelRow } from '../../invite/components/InviteChannelRow';
import { useInviteListRows } from '../../invite/hooks/useInviteListRows';
import { lastChatPreview } from '../../channels/utils/lastChatPreview';

export const PlaceChannelManagePage = () => {
    const { t } = useTranslation();
    const { placeId } = useParams<{ placeId: string }>();
    const { toast } = useToast();

    const { channels, isLoading } = useHomeChannels(placeId ?? null);
    const { myJoins, unreads } = useActiveCloudData();
    const { byChannel: unreadByChannel } = unreads;
    useJoinSyncRegistration(channels);
    const { profile: myProfile } = useMyProfile();
    const { userId: uid } = runtime.session.useSessionIdentity();
    const dmPeers = useDmPeers(placeId ?? null, channels, uid);
    const lastChats = useLastChats(channels, myJoins);
    const lastActivities = useLastActivities(channels, myJoins);
    const amRoomOwner = (channel: DomainChannel) => isRoomOwner(channel, channel.$join, uid);

    const { selectedCloudId } = runtime.session.useSessionSelection();
    const placeScope = placeScopeKey(selectedCloudId, placeId);

    const isDefaultCloud = selectedCloudId === 'default';
    const navigate = useNavigateWithTransition();
    const { invites: sentInvitesAll } = useInviteListRows();
    const sentInvites = isDefaultCloud ? sentInvitesAll : [];
    const { channelSort: sortMethodMap } = useChannelSort();
    const { pinnedIds, toggle: togglePinned } = usePinnedChannels(placeScope);
    const pinnedChannelIds = useMemo(() => new Set(pinnedIds), [pinnedIds]);

    const sortedChannels = useMemo(
        () =>
            sortChannels({
                channels,
                lastChatByChannel: lastActivities,
                unreadByChannel,
                sortMethod: (placeScope && sortMethodMap[placeScope]) || DEFAULT_CHANNEL_SORT,
                pinnedChannelIds,
            }),
        [channels, lastActivities, unreadByChannel, placeScope, sortMethodMap, pinnedChannelIds]
    );

    const isSelectable = (channel: DomainChannel) => channel.stereo !== 'self';

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    const selectableKey = sortedChannels
        .filter(isSelectable)
        .map(channel => channel.id)
        .join(',');
    useEffect(() => {
        const available = new Set(selectableKey ? selectableKey.split(',') : []);
        setSelectedIds(prev => {
            const next = new Set([...prev].filter(id => available.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [selectableKey]);

    const { deleteChannel, leaveChannel } = useChannelMutations();

    const toggleSelected = (channelId: string, checked: boolean) =>
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(channelId);
            else next.delete(channelId);
            return next;
        });

    const handleTogglePin = (channelId: string) => {
        const willPin = !pinnedChannelIds.has(channelId);
        togglePinned(channelId);
        toast({ title: willPin ? t('channelManage.pinned') : t('channelManage.unpinned') });
    };

    const handleMarkRead = () => {
        const targets = (
            selectedIds.size > 0 ? sortedChannels.filter(channel => selectedIds.has(channel.id)) : sortedChannels
        ).filter(channel => (unreadByChannel[channel.id] ?? 0) > 0 && (channel.chatNo ?? 0) > 0);

        if (targets.length === 0) {
            toast({ title: t('channelManage.nothingToRead') });
            return;
        }

        const reads = targets.map(channel =>
            runtime.data
                .getCloudRepositories(toCloudId(channel.cid || selectedCloudId))
                .join.readChat({ channelId: channel.id, chatNo: channel.chatNo as number })
                .then(receipt => receipt.delivered)
        );
        toast({ title: t('channelManage.readDone') });

        void Promise.allSettled(reads).then(results => {
            const failed = results.filter(result => result.status === 'rejected').length;
            if (failed === 0) return;
            logger.error('CHAT', 'Failed to mark rooms read', { data: { failed, total: targets.length } });
            toast({ title: t('channelManage.readFailed', { count: failed }), variant: 'destructive' });
        });
    };

    const handleRemoveSelected = async () => {
        const targets = sortedChannels.filter(channel => selectedIds.has(channel.id));
        if (targets.length === 0) return;

        setIsRemoving(true);
        const results = await Promise.allSettled(
            targets.map(channel => {
                const action = removalActionFor(channelKindOf(channel.stereo), amRoomOwner(channel));
                if (action === 'none') return Promise.resolve(undefined);
                return action === 'delete'
                    ? deleteChannel({ channelId: channel.id })
                    : leaveChannel({ channelId: channel.id });
            })
        );
        setIsRemoving(false);
        setIsConfirmOpen(false);

        const failed = results.filter(result => result.status === 'rejected').length;
        const succeeded = targets.length - failed;

        if (failed > 0) {
            const firstError = results.find(result => result.status === 'rejected') as
                | PromiseRejectedResult
                | undefined;
            logger.error('CHAT', 'Failed to remove rooms', {
                error: firstError?.reason,
                data: { failed, total: targets.length, mode: removesByDeleting ? 'delete' : 'leave' },
            });
        }

        if (succeeded > 0) {
            toast({
                title: removesByDeleting
                    ? t('channelManage.deleteDone', { count: succeeded })
                    : t('channelManage.leaveDone', { count: succeeded }),
            });
        }
        if (failed > 0) {
            toast({
                title: removesByDeleting
                    ? t('channelManage.deleteFailed', { count: failed })
                    : t('channelManage.leaveFailed', { count: failed }),
                variant: 'destructive',
            });
        }
    };

    const selectedCount = selectedIds.size;

    const removesByDeleting =
        selectedIds.size > 0 &&
        sortedChannels
            .filter(channel => selectedIds.has(channel.id))
            .every(channel => removalActionFor(channelKindOf(channel.stereo), amRoomOwner(channel)) === 'delete');
    const hasSelection = selectedCount > 0;

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader
                title={t('channelManage.title')}
                rightAction={
                    <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        disabled={!hasSelection}
                        className="text-[15px] font-medium text-foreground disabled:text-placeholder"
                    >
                        {t('channelManage.clearSelection')}
                    </button>
                }
            />

            <div className="min-h-0 flex-1 overflow-y-auto py-2">
                {sentInvites.map(invite => {
                    const id = invite.id;
                    if (!id) return null;
                    return (
                        <InviteChannelRow
                            key={id}
                            invite={invite}
                            onClick={() => navigate(ROUTES.invite.waiting(id))}
                        />
                    );
                })}

                {isLoading && sortedChannels.length === 0
                    ? Array.from({ length: 3 }).map((_, index) => (
                          <div key={index} className="flex items-center gap-3 px-4 py-3">
                              <div className="size-[42px] animate-pulse rounded-full bg-muted" />
                              <div className="flex flex-1 flex-col gap-1.5">
                                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                                  <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                              </div>
                          </div>
                      ))
                    : sortedChannels.length === 0
                      ? sentInvites.length === 0 && (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                {t('channelList.empty')}
                            </div>
                        )
                      : sortedChannels.map(channel => (
                            <ManageChannelRow
                                key={channel.id}
                                channel={channel}
                                uid={uid ?? undefined}
                                myNick={myProfile?.nick}
                                myThumbnail={myProfile?.thumbnail}
                                joinNick={myJoins.get(channel.id)?.nick}
                                dmPeer={dmPeers.get(channel.id)}
                                lastChat={lastChats.get(channel.id)}
                                lastActivity={lastActivities.get(channel.id)}
                                unread={unreadByChannel[channel.id] ?? 0}
                                selectable={isSelectable(channel)}
                                checked={selectedIds.has(channel.id)}
                                onToggle={checked => toggleSelected(channel.id, checked)}
                                pinned={pinnedChannelIds.has(channel.id)}
                                onTogglePin={() => handleTogglePin(channel.id)}
                            />
                        ))}
            </div>

            <div className="flex shrink-0 gap-2 px-4 pb-safe-bottom pt-3">
                <Button variant="outline" tone="gray" size="md" fullWidth onClick={handleMarkRead}>
                    {hasSelection
                        ? t('channelManage.readSelected', { count: selectedCount })
                        : t('channelManage.readAll')}
                </Button>
                <Button
                    variant="outline"
                    tone="gray"
                    size="md"
                    fullWidth
                    disabled={!hasSelection}
                    onClick={() => setIsConfirmOpen(true)}
                    className="text-destructive disabled:text-placeholder"
                >
                    {removesByDeleting ? t('channelManage.deleteRooms') : t('channelManage.leaveRooms')}
                </Button>
            </div>

            <ConfirmDialog
                open={isConfirmOpen}
                onOpenChange={setIsConfirmOpen}
                title={
                    removesByDeleting
                        ? t('channelManage.deleteDialog.title', { count: selectedCount })
                        : t('channelManage.leaveDialog.title', { count: selectedCount })
                }
                description={
                    removesByDeleting
                        ? t('channelManage.deleteDialog.description')
                        : t('channelManage.leaveDialog.description')
                }
                confirmLabel={
                    removesByDeleting ? t('channelManage.deleteDialog.confirm') : t('channelManage.leaveDialog.confirm')
                }
                onConfirm={handleRemoveSelected}
                isPending={isRemoving}
            />
        </div>
    );
};

interface ManageChannelRowProps {
    channel: DomainChannel;
    uid?: string;
    myNick?: string;
    myThumbnail?: string;
    joinNick?: string;
    dmPeer?: DmPeer;
    lastChat?: DomainChat;
    lastActivity?: DomainChat;
    unread: number;
    selectable: boolean;
    checked: boolean;
    onToggle: (checked: boolean) => void;
    pinned: boolean;
    onTogglePin: (pinned: boolean) => void;
}

const ManageChannelRow = ({
    channel,
    uid,
    myNick,
    myThumbnail,
    joinNick,
    dmPeer,
    lastChat,
    lastActivity,
    unread,
    selectable,
    checked,
    onToggle,
    pinned,
    onTogglePin,
}: ManageChannelRowProps) => {
    const { t, i18n } = useTranslation();
    const isSelf = channel.stereo === 'self';

    const name = resolveChannelTitle({
        channel,
        uid,
        joinNick,
        myNick,
        peerNick: dmPeer?.profileNick,
        peerCloudName: dmPeer?.cloudName,
        selfLabel: t('channelList.selfChannel'),
        unnamedLabel: t('channelList.unnamedChannel'),
        dmUnnamedLabel: t('chat.dm.unnamedPeer'),
    });

    const { src: avatarSrc, glyph } = resolveChannelAvatar({ channel, myThumbnail, peerThumbnail: dmPeer?.thumbnail });

    const activity = lastActivity ?? lastChat;
    const time = activity?.createdAt
        ? new Date(activity.createdAt).toLocaleTimeString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit',
          })
        : '';

    return (
        <ManageChannelItem
            leading={
                avatarSrc ? (
                    <ImageAvatar src={avatarSrc} alt="" size={42} />
                ) : (
                    <DefaultAvatar size={42} variant={glyph} />
                )
            }
            title={
                <>
                    {isSelf && (
                        <Badge variant="solid" tone="dark" className="px-1.5 py-0.5 text-[11px] leading-none">
                            MY
                        </Badge>
                    )}
                    <span className="truncate">{name}</span>
                </>
            }
            subtitle={lastChatPreview(lastChat, t) || undefined}
            time={time}
            unread={unread}
            selectable={selectable}
            checked={checked}
            onToggle={onToggle}
            selectLabel={name}
            pinned={pinned}
            onTogglePin={onTogglePin}
            pinLabel={pinned ? t('channelManage.unpin') : t('channelManage.pin')}
        />
    );
};
