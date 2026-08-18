import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import { reportError, useSessionIdentity, useSessionSelection } from '@chatic/web-core';
import type { DomainChannel, DomainChat } from '@chatic/data';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { Badge, Button, DefaultAvatar, ImageAvatar, ManageChannelItem } from '@chatic/web-ui-kit';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

import { PageHeader } from '../../../ui';
import { toError } from '../../../utils/errors';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { DEFAULT_CHANNEL_SORT, placeScopeKey } from '../../../stores/preferenceKeys';
import { ConfirmDialog } from '../../channels/components';
import { useChannelMutations, useChatMutations, useDmPeers, type DmPeer } from '../../channels/hooks';
import { useActiveCloudData, useHomeChannels, useJoinSyncRegistration, useLastChats } from '../../../hooks';
import { resolveChannelAvatar, resolveChannelTitle } from '../../channels/lib';
import { sortChannels } from '../../../utils/sortChannels';
import { useMyProfile } from '../../../hooks';
import { useNavigateWithTransition } from '@chatic/shared';
import { ROUTES } from '../../../routes/paths';
import { InviteChannelRow } from '../../invite/components/InviteChannelRow';
import { useInviteListRows } from '../../invite/hooks/useInviteListRows';

/**
 * Chat-room management (Figma 3408-28373) — reached from the place settings hub. Rooms are
 * multi-selected and then removed in bulk, or marked read; each row can also be pinned.
 *
 * Removal is owner-vs-participant: a place OWNER deletes the rooms (they are the only role that
 * can create them, so they own every room in the place), a participant leaves them. The mode
 * follows the server's `place.isOwner` (ADR-0031 — the server is the authority).
 *
 * Pinning is CLIENT-ONLY: neither ChannelModel nor JoinModel carries a pin field, so pins live in
 * the local `pinnedChannels` preference — keyed by cloud+place (placeScopeKey) — and only affect
 * list ordering on this device.
 */
export const PlaceChannelManagePage = () => {
    const { t } = useTranslation();
    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepo } = useRuntimeRepositories();
    const { toast } = useToast();

    const [place, setPlace] = useState<MySiteView | null>(null);
    useEffect(() => {
        if (!placeId) {
            setPlace(null);
            return;
        }
        return placeRepo.observeItem(placeId, setPlace);
    }, [placeRepo, placeId]);

    const isOwner = !!place?.isOwner;

    const { channels, isLoading } = useHomeChannels(placeId ?? null);
    // Same source as home (see ActiveCloudData): the cloud-wide aggregation already holds this
    // place's rows, so this page reads them instead of opening its own observer per channel. The
    // read-cursor SYNC still belongs to this screen, so it registers that itself.
    const { myJoins, unreads } = useActiveCloudData();
    const { byChannel: unreadByChannel } = unreads;
    useJoinSyncRegistration(channels);
    const { profile: myProfile } = useMyProfile();
    const { userId: uid } = useSessionIdentity();
    // 1:1 peers for every DM row, from ONE place-level profile subscription — the same source the
    // home list uses, so both lists name a DM identically (ADR-0039).
    const dmPeers = useDmPeers(placeId ?? null, channels, uid);
    // Last-message previews from ONE combined observation (ADR-0057) — the same source as the home
    // list, replacing the per-row cache-window subscription this page used to make per rendered row.
    const lastChats = useLastChats(channels);

    // Sort + pins are scoped to cid:sid (see placeScopeKey) — the route only carries the sid, so the
    // cloud half comes from the active session.
    const { selectedCloudId } = useSessionSelection();
    const placeScope = placeScopeKey(selectedCloudId, placeId);

    // Sent relay invites (ADR-0033 Track B) only apply to the default (relay) cloud's place — a
    // custom cloud's channels are invited via the cloud invite flow (ADR-0016) instead. Gate the
    // rendering, not the fetch (useInviteListRows runs the same react-query hook regardless).
    const isDefaultCloud = selectedCloudId === 'default';
    const navigate = useNavigateWithTransition();
    const { invites: sentInvitesAll } = useInviteListRows();
    const sentInvites = isDefaultCloud ? sentInvitesAll : [];
    const sortMethodMap = usePreferenceStore(s => s.channelSort);
    const pinnedMap = usePreferenceStore(s => s.pinnedChannels);
    const setChannelPinned = usePreferenceStore(s => s.setChannelPinned);
    const pinnedChannelIds = useMemo(
        () => new Set(placeScope ? (pinnedMap[placeScope] ?? []) : []),
        [pinnedMap, placeScope]
    );

    // Same ordering as the home list so a room sits in the position the user expects.
    const sortedChannels = useMemo(
        () =>
            sortChannels({
                channels,
                lastChatByChannel: lastChats,
                unreadByChannel,
                sortMethod: (placeScope && sortMethodMap[placeScope]) || DEFAULT_CHANNEL_SORT,
                pinnedChannelIds,
            }),
        [channels, lastChats, unreadByChannel, placeScope, sortMethodMap, pinnedChannelIds]
    );

    // Self-chat can be neither deleted nor left, so it is not selectable (Figma: the MY row has no
    // checkbox). Everything else in the place is fair game.
    const isSelectable = (channel: DomainChannel) => channel.stereo !== 'self';

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [isMarkingRead, setIsMarkingRead] = useState(false);

    // Drop selections for rooms that left the list (removed here, or elsewhere via sync) so the
    // count and the confirm dialog can never refer to a room that is no longer shown.
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
    const { readMessage } = useChatMutations();

    const toggleSelected = (channelId: string, checked: boolean) =>
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(channelId);
            else next.delete(channelId);
            return next;
        });

    const handleTogglePin = (channelId: string, pinned: boolean) => {
        if (!placeScope) return;
        setChannelPinned(placeScope, channelId, pinned);
        toast({ title: pinned ? t('channelManage.pinned') : t('channelManage.unpinned') });
    };

    /**
     * Mark rooms read by advancing the join read cursor to each channel head — the same `chatNo`
     * the room view sends on entry (useReadMarker). With no selection this reads every room,
     * matching the button's "모두 읽음" state.
     */
    const handleMarkRead = async () => {
        const targets = (
            selectedIds.size > 0 ? sortedChannels.filter(channel => selectedIds.has(channel.id)) : sortedChannels
        ).filter(channel => (unreadByChannel[channel.id] ?? 0) > 0 && (channel.chatNo ?? 0) > 0);

        if (targets.length === 0) {
            toast({ title: t('channelManage.nothingToRead') });
            return;
        }

        setIsMarkingRead(true);
        const results = await Promise.allSettled(
            targets.map(channel => readMessage({ channelId: channel.id, chatNo: channel.chatNo as number }))
        );
        setIsMarkingRead(false);

        const failed = results.filter(result => result.status === 'rejected').length;
        if (failed === 0) {
            toast({ title: t('channelManage.readDone') });
            return;
        }
        logger.error('CHAT', 'Failed to mark rooms read', { data: { failed, total: targets.length } });
        toast({ title: t('channelManage.readFailed', { count: failed }), variant: 'destructive' });
    };

    /**
     * Remove the selected rooms one by one — there is no bulk endpoint. Owner → channel.delete,
     * participant → channel.leave. Both repository calls evict the room from the local cache
     * optimistically (rolling back on failure), so the observed list updates itself.
     */
    const handleRemoveSelected = async () => {
        const targets = sortedChannels.filter(channel => selectedIds.has(channel.id));
        if (targets.length === 0) return;

        setIsRemoving(true);
        const results = await Promise.allSettled(
            targets.map(channel =>
                isOwner ? deleteChannel({ channelId: channel.id }) : leaveChannel({ channelId: channel.id })
            )
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
                data: { failed, total: targets.length, mode: isOwner ? 'delete' : 'leave' },
            });
            if (firstError) reportError(toError(firstError.reason));
        }

        if (succeeded > 0) {
            toast({
                title: isOwner
                    ? t('channelManage.deleteDone', { count: succeeded })
                    : t('channelManage.leaveDone', { count: succeeded }),
            });
        }
        if (failed > 0) {
            toast({
                title: isOwner
                    ? t('channelManage.deleteFailed', { count: failed })
                    : t('channelManage.leaveFailed', { count: failed }),
                variant: 'destructive',
            });
        }
    };

    const selectedCount = selectedIds.size;
    const hasSelection = selectedCount > 0;

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
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
                {/* Sent-invite rows (default cloud only) float above the manageable channels —
                    tapping goes to the waiting screen, which owns cancel/reissue (see
                    InviteChannelRow). Not part of the checkbox/bulk-delete selection below: an
                    invite id isn't a channel id, and the delete-vs-leave branching doesn't apply. */}
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
                                unread={unreadByChannel[channel.id] ?? 0}
                                selectable={isSelectable(channel)}
                                checked={selectedIds.has(channel.id)}
                                onToggle={checked => toggleSelected(channel.id, checked)}
                                pinned={pinnedChannelIds.has(channel.id)}
                                onTogglePin={pinned => handleTogglePin(channel.id, pinned)}
                            />
                        ))}
            </div>

            {/* Bottom actions — mark read (all, or just the selection) and remove the selection. */}
            <div className="flex shrink-0 gap-2 px-4 pb-safe-bottom pt-3">
                <Button
                    variant="outline"
                    tone="gray"
                    size="md"
                    fullWidth
                    loading={isMarkingRead}
                    onClick={handleMarkRead}
                >
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
                    {isOwner ? t('channelManage.deleteRooms') : t('channelManage.leaveRooms')}
                </Button>
            </div>

            <ConfirmDialog
                open={isConfirmOpen}
                onOpenChange={setIsConfirmOpen}
                title={
                    isOwner
                        ? t('channelManage.deleteDialog.title', { count: selectedCount })
                        : t('channelManage.leaveDialog.title', { count: selectedCount })
                }
                description={
                    isOwner ? t('channelManage.deleteDialog.description') : t('channelManage.leaveDialog.description')
                }
                confirmLabel={
                    isOwner ? t('channelManage.deleteDialog.confirm') : t('channelManage.leaveDialog.confirm')
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
    /** My place-profile photo — the self-chat row's avatar (see resolveChannelAvatar). */
    myThumbnail?: string;
    joinNick?: string;
    /** The 1:1 peer for this row (from the page-level useDmPeers). Undefined for non-DM rows. */
    dmPeer?: DmPeer;
    /** This row's last-message preview, from the page-level useLastChats (ADR-0057). */
    lastChat?: DomainChat;
    unread: number;
    selectable: boolean;
    checked: boolean;
    onToggle: (checked: boolean) => void;
    pinned: boolean;
    onTogglePin: (pinned: boolean) => void;
}

/** One management row — presentation only; the preview arrives as a prop from the page. */
const ManageChannelRow = ({
    channel,
    uid,
    myNick,
    myThumbnail,
    joinNick,
    dmPeer,
    lastChat,
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
        selfLabel: t('channelList.selfChannel'),
        unnamedLabel: t('channelList.unnamedChannel'),
        dmUnnamedLabel: t('chat.dm.unnamedPeer'),
    });

    // Self → my place-profile photo, DM → the peer's, else the channel photo; the same rule also
    // picks the placeholder glyph (group rooms get the two-person one). See resolveChannelAvatar.
    const { src: avatarSrc, glyph } = resolveChannelAvatar({ channel, myThumbnail, peerThumbnail: dmPeer?.thumbnail });

    const time = lastChat?.createdAt
        ? new Date(lastChat.createdAt).toLocaleTimeString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', {
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
            subtitle={lastChat?.content || undefined}
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
