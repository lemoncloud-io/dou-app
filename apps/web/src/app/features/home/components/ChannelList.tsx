import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AtSign } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import {
    runtime,
    isMentioningViewer,
    toPlainPreview,
    type DomainChannel,
    type DomainChat,
    type DomainJoin,
} from '@chatic/runtime-react';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    ActivityCountBadge,
    Badge,
    CollapsibleSection,
    DefaultAvatar,
    IconBell,
    IconBellOff,
    IconEdit,
    IconLeave,
    IconPin,
    IconTrash,
    ImageAvatar,
    ListRow,
    SwipeActionRow,
    UnreadBadge,
    type SwipeAction,
    type SwipeSide,
} from '@chatic/web-ui-kit';

import { useDmPeers, type DmPeer } from '../../channels/hooks';
import { useLastChatSenders } from '../hooks/useLastChatSenders';
import { isSomeoneElsesSelfChat } from '../../channels/utils/membership';
import type { ChannelSortMethod } from '../../../stores/preferenceKeys';
import { ROUTES } from '../../../routes/paths';
import { useLastActivities, useLastChats } from '../../../hooks/useLastChats';
import { readSelectedCloudId } from '../../../hooks/useCloudScope';
import { useBlurLastMessage, useChannelUnreads, useMyProfile } from '../../../hooks';
import { divergenceReporter } from '../../../runtime/logging/divergenceReporter';
import { readMarkRegistry } from '../../../runtime/logging/readMarkRegistry';
import { roomOpenTrace } from '../../../runtime/perf';
import { haptics } from '../../../bridge/haptics';
import { readCursorOf, readPositionOf } from '../../../utils/countUnread';
import {
    channelKindOf,
    isRoomOwner,
    removalActionFor,
    resolveChannelAvatar,
    resolveChannelTitle,
    showsMemberCount,
} from '../../channels/lib';
import { lastChatPreview } from '../../channels/utils/lastChatPreview';
import { notifyLevelOf } from '../../channels/utils/notifyLevel';
import { sortChannels } from '../../../utils/sortChannels';
import { InviteChannelRow } from '../../invite/components/InviteChannelRow';
import { ChannelEmptyState } from './ChannelEmptyState';
import { ChannelCreateMenu } from './ChannelCreateMenu';
import { useNotificationStore } from '../../../stores/useNotificationStore';
import { channelBadges, type ChannelBadges } from '../../../utils/notifications';
import { useChannelRowActions } from '../hooks/useChannelRowActions';
import { useComposerDraftStore } from '../../channels/stores/useComposerDraftStore';

const ChannelSkeleton = ({ delayMs = 0 }: { delayMs?: number }) => (
    <div className="flex animate-pulse items-center gap-3 px-4 py-3" style={{ animationDelay: `${delayMs}ms` }}>
        <div className="size-[42px] rounded-full bg-muted" />
        <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-3 w-48 rounded bg-muted" />
        </div>
    </div>
);

const ChannelItem = ({
    channel,
    unread,
    myNick,
    myThumbnail,
    joinNick,
    uid,
    dmPeer,
    pinned,
    muted,
    mentionOnly,
    myMemberId,
    lastChat,
    lastActivity,
    lastChatSender,
    inboxActivity,
}: {
    channel: DomainChannel;
    unread: number;
    myNick?: string;
    myThumbnail?: string;
    joinNick?: string;
    uid?: string;
    dmPeer?: DmPeer;
    pinned?: boolean;
    muted?: boolean;
    mentionOnly?: boolean;
    myMemberId?: string;
    lastChat?: DomainChat;
    lastActivity?: DomainChat;
    lastChatSender?: string;
    inboxActivity?: ChannelBadges;
}) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { blurLastMessage } = useBlurLastMessage();
    const isSelf = channel.stereo === 'self';
    const isForeignSelfChat = isSomeoneElsesSelfChat(channel, uid);

    runtime.sync.useChannelSync(isForeignSelfChat ? undefined : channel.id);

    const formatTime = (dateValue?: string | number) => {
        if (!dateValue) return '';
        const date = new Date(dateValue);
        const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    };

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

    const preview = lastChatPreview(lastChat, t, lastChatSender);
    const activity = lastActivity ?? lastChat;
    const time = activity?.createdAt ? formatTime(activity.createdAt) : '';

    const mentionsMe =
        unread > 0 &&
        !!lastChat &&
        !lastChat.hidden &&
        lastChat.ownerId !== uid &&
        lastChat.ownerId !== myMemberId &&
        isMentioningViewer(lastChat, [myMemberId, uid]);

    const draftText = useComposerDraftStore(state => state.texts[channel.id]);
    const draftFiles = useComposerDraftStore(state => state.held[channel.id]);
    const draftLine = toPlainPreview(draftText ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    const draftPreview =
        draftLine ||
        (draftFiles && draftFiles.length > 1
            ? t('chat.attach.previewFileCount', { count: draftFiles.length })
            : (draftFiles?.[0]?.source.name ?? ''));
    const line = draftPreview || preview;

    const { src: avatarSrc, glyph } = resolveChannelAvatar({ channel, myThumbnail, peerThumbnail: dmPeer?.thumbnail });
    const leading = avatarSrc ? (
        <ImageAvatar src={avatarSrc} alt="" size={42} />
    ) : (
        <DefaultAvatar size={42} variant={glyph} />
    );

    return (
        <ListRow
            leading={leading}
            title={
                <>
                    {isSelf && (
                        <Badge variant="solid" tone="dark" className="px-1.5 py-0.5 text-[11px] leading-none">
                            MY
                        </Badge>
                    )}
                    <span className="truncate">{name}</span>
                    {showsMemberCount(channelKindOf(channel.stereo)) && (channel.memberNo ?? 0) > 1 && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
                            {channel.memberNo}
                        </span>
                    )}
                    {pinned && (
                        <IconPin
                            size={12}
                            filled
                            role="img"
                            aria-label={t('channelList.pinned')}
                            aria-hidden={false}
                            className="shrink-0 text-control-idle"
                        />
                    )}
                    {muted && (
                        <IconBellOff
                            role="img"
                            aria-label={t('channelList.muted')}
                            aria-hidden={false}
                            className="size-3.5 shrink-0 text-muted-foreground"
                        />
                    )}
                    {mentionOnly && (
                        <AtSign
                            role="img"
                            aria-label={t('channelList.mentionOnly')}
                            aria-hidden={false}
                            className="size-3.5 shrink-0 text-muted-foreground"
                        />
                    )}
                </>
            }
            subtitleIcon={
                draftPreview ? (
                    <IconEdit
                        size={14}
                        role="img"
                        aria-label={t('channelList.draft')}
                        aria-hidden={false}
                        className="shrink-0"
                    />
                ) : undefined
            }
            subtitle={
                line ? (
                    <>
                        {mentionsMe && !draftPreview && (
                            <span className="mr-1 font-semibold text-brand-ink dark:text-primary">
                                {t('channelList.mentionedMe')}
                            </span>
                        )}
                        {blurLastMessage ? <span className="select-none blur-[5px]">{line}</span> : line}
                    </>
                ) : undefined
            }
            trailing={
                <div className="flex flex-col items-end gap-1">
                    <span className="text-[12px] leading-4 text-description">{time}</span>
                    <div className="flex items-center gap-1">
                        <ActivityCountBadge
                            variant="mention"
                            count={inboxActivity?.mentions ?? 0}
                            label={t('channelList.activity.mentions', { count: inboxActivity?.mentions ?? 0 })}
                        />
                        <ActivityCountBadge
                            variant="thread"
                            count={inboxActivity?.threads ?? 0}
                            label={t('channelList.activity.threads', { count: inboxActivity?.threads ?? 0 })}
                        />
                        <UnreadBadge count={unread} variant="pill" />
                    </div>
                </div>
            }
            onClick={() => {
                roomOpenTrace.begin(channel.id, 'list');
                if (!isForeignSelfChat) void runtime.sync.prefetchRoomFeed(readSelectedCloudId(), channel.id);
                navigate(ROUTES.channels.room(channel.id), { state: { channel } });
            }}
        />
    );
};

interface ChannelListProps {
    channels: DomainChannel[];
    joinByChannel?: Map<string, DomainJoin>;
    sid: string;
    isLoading: boolean;
    title?: string;
    emptyLabel?: string;
    canCreate?: boolean;
    isDefaultCloud?: boolean;
    showOneOnOneCreate?: boolean;
    isPro?: boolean;
    sortMethod?: ChannelSortMethod;
    pinnedChannelIds?: ReadonlySet<string>;
    leadsWithSelf?: boolean;
    onTogglePin?: (channelId: string) => void;
    onCreateOneOnOne?: () => void;
    onCreate?: () => void;
    createLabel?: string;
    onCreateGroup?: () => void;
    isInvitedPlace?: boolean;
    onOpenPlaceInfo?: () => void;
    sentInvites?: MyInviteView[];
    onSelectInvite?: (inviteId: string) => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    bare?: boolean;
}

export const ChannelList = ({
    channels,
    joinByChannel,
    sid,
    isLoading,
    title,
    emptyLabel,
    canCreate,
    isDefaultCloud,
    showOneOnOneCreate,
    isPro,
    sortMethod = 'recent',
    pinnedChannelIds,
    leadsWithSelf,
    onTogglePin,
    onCreateOneOnOne,
    onCreateGroup,
    onCreate,
    createLabel,
    isInvitedPlace,
    onOpenPlaceInfo,
    sentInvites = [],
    onSelectInvite,
    open,
    onOpenChange,
    bare = false,
}: ChannelListProps) => {
    const { t } = useTranslation();
    const { profile: myProfile } = useMyProfile();
    const myNick = myProfile?.nick;
    const myThumbnail = myProfile?.thumbnail;
    const { userId: uid } = runtime.session.useSessionIdentity();
    const { byChannel: unreadByChannel } = useChannelUnreads(channels, joinByChannel);
    const checkedRef = useRef(false);
    useEffect(() => {
        if (checkedRef.current || channels.length === 0) return;
        checkedRef.current = true;
        for (const channel of channels) {
            const marked = readMarkRegistry.markOf(channel.id);
            if (marked === undefined) continue;
            const position = readPositionOf(joinByChannel?.get(channel.id), channel.$join);
            divergenceReporter.unread({
                channelId: channel.id,
                markedChatNo: marked,
                cursorChatNo: readCursorOf(position),
                headChatNo: channel.chatNo,
                drawn: unreadByChannel[channel.id] ?? 0,
                hasReadMetaNo: position?.metaNo !== undefined,
            });
        }
    }, [channels, joinByChannel, unreadByChannel]);

    const dmPeers = useDmPeers(sid, channels, uid);
    const lastChats = useLastChats(channels, joinByChannel);
    const lastActivities = useLastActivities(channels, joinByChannel);
    const lastChatSenders = useLastChatSenders(sid, channels, lastChats);

    const notificationItems = useNotificationStore(state => state.items);
    const activityByChannel = useMemo(() => {
        const cloudId = readSelectedCloudId();
        const items = Object.values(notificationItems).filter(item => item.cloudId === cloudId);
        return new Map(channels.map(channel => [channel.id, channelBadges(items, channel.id)]));
    }, [notificationItems, channels]);

    const [openRow, setOpenRow] = useState<{ id: string; side: SwipeSide } | null>(null);
    const rowActions = useChannelRowActions();
    const { toast } = useToast();

    const swipeActionsFor = (
        channel: DomainChannel,
        join: DomainJoin | undefined,
        pinned: boolean,
        muted: boolean
    ): { leading: SwipeAction[]; trailing: SwipeAction[] } => {
        if (isSomeoneElsesSelfChat(channel, uid ?? undefined)) return { leading: [], trailing: [] };
        const canPin = !!onTogglePin && !(leadsWithSelf && channel.stereo === 'self');
        const leading: SwipeAction[] = canPin
            ? [
                  {
                      key: 'pin',
                      label: t(pinned ? 'channelList.swipe.unpin' : 'channelList.swipe.pin'),
                      tone: 'accent',
                      icon: <IconPin size={18} filled={!pinned} />,
                      onSelect: () => {
                          onTogglePin?.(channel.id);
                          toast({ title: t(pinned ? 'channelManage.unpinned' : 'channelManage.pinned') });
                      },
                  },
              ]
            : [];
        const removal = removalActionFor(channelKindOf(channel.stereo), isRoomOwner(channel, channel.$join, uid));
        if (removal === 'none') return { leading, trailing: [] };
        return {
            leading,
            trailing: [
                {
                    key: 'mute',
                    label: t(muted ? 'channelList.swipe.unmute' : 'channelList.swipe.mute'),
                    tone: 'neutral',
                    icon: muted ? <IconBell className="size-[18px]" /> : <IconBellOff className="size-[18px]" />,
                    onSelect: () => rowActions.setMuted(channel, join, !muted),
                },
                {
                    key: 'remove',
                    label: t(removal === 'delete' ? 'channelList.swipe.delete' : 'channelList.swipe.leave'),
                    tone: 'destructive',
                    icon:
                        removal === 'delete' ? (
                            <IconTrash className="size-[18px]" />
                        ) : (
                            <IconLeave className="size-[18px]" />
                        ),
                    onSelect: () => rowActions.requestRemoval(channel, removal),
                },
            ],
        };
    };

    const sortedChannels = useMemo(
        () =>
            sortChannels({
                channels,
                lastChatByChannel: lastActivities,
                unreadByChannel,
                sortMethod,
                pinnedChannelIds,
                leadsWithSelf,
            }),
        [channels, lastActivities, unreadByChannel, sortMethod, pinnedChannelIds, leadsWithSelf]
    );

    const showGroupCreate = canCreate && (!isDefaultCloud || !isPro);

    const createMenu =
        onCreate || showGroupCreate || showOneOnOneCreate ? (
            <ChannelCreateMenu
                onCreate={onCreate}
                createLabel={createLabel}
                showOneOnOneCreate={showOneOnOneCreate}
                onCreateOneOnOne={onCreateOneOnOne}
                showGroupCreate={showGroupCreate}
                onCreateGroup={onCreateGroup}
                isPro={isPro}
            />
        ) : undefined;

    const body = (
        <>
            {sentInvites.map(invite => {
                const id = invite.id;
                if (!id) return null;
                return <InviteChannelRow key={id} invite={invite} onClick={() => onSelectInvite?.(id)} />;
            })}

            {isLoading && channels.length === 0 ? (
                <div role="status" aria-label={t('channelList.loading')} className="flex flex-col">
                    <ChannelSkeleton />
                    <ChannelSkeleton delayMs={150} />
                    <ChannelSkeleton delayMs={300} />
                </div>
            ) : channels.length === 0 ? (
                sentInvites.length === 0 &&
                (emptyLabel ? (
                    <div className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyLabel}</div>
                ) : (
                    <ChannelEmptyState
                        variant={isInvitedPlace ? 'invited' : 'owner'}
                        onOpenPlaceInfo={onOpenPlaceInfo}
                    />
                ))
            ) : (
                sortedChannels.map(channel => {
                    const join = joinByChannel?.get(channel.id);
                    const pinned =
                        !(leadsWithSelf && channel.stereo === 'self') && (pinnedChannelIds?.has(channel.id) ?? false);
                    const notifyLevel = notifyLevelOf(join?.notify, channel.stereo === 'dm');
                    const muted = notifyLevel === 'none';
                    const { leading, trailing } = swipeActionsFor(channel, join, pinned, muted);
                    return (
                        <SwipeActionRow
                            key={channel.id}
                            leadingActions={leading}
                            trailingActions={trailing}
                            open={openRow?.id === channel.id ? openRow.side : null}
                            onOpenChange={side => setOpenRow(side ? { id: channel.id, side } : null)}
                            onReveal={() => haptics.play('selection')}
                        >
                            <ChannelItem
                                channel={channel}
                                unread={unreadByChannel[channel.id] ?? 0}
                                myNick={myNick}
                                myThumbnail={myThumbnail}
                                joinNick={join?.nick}
                                uid={uid ?? undefined}
                                dmPeer={dmPeers.get(channel.id)}
                                pinned={pinned}
                                muted={muted}
                                mentionOnly={notifyLevel === 'mention'}
                                myMemberId={join?.userId}
                                lastChat={lastChats.get(channel.id)}
                                lastActivity={lastActivities.get(channel.id)}
                                lastChatSender={lastChatSenders.get(channel.id)}
                                inboxActivity={activityByChannel.get(channel.id)}
                            />
                        </SwipeActionRow>
                    );
                })
            )}
            {rowActions.dialog}
        </>
    );

    if (bare) return <div className="flex flex-col">{body}</div>;

    return (
        <CollapsibleSection
            title={title ?? t('homePage.channels')}
            count={isLoading ? undefined : channels.length}
            actions={createMenu}
            open={open}
            onOpenChange={onOpenChange}
        >
            {body}
        </CollapsibleSection>
    );
};
