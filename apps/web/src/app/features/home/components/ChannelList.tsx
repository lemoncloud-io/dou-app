import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { BellOff } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import { useChannelSync } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/app-runtime';
import type { DomainChannel, DomainChat, DomainJoin } from '@chatic/data';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import {
    Badge,
    CollapsibleSection,
    DefaultAvatar,
    IconChatAdd,
    IconPin,
    ImageAvatar,
    ListRow,
    SubscriptionBadge,
    UnreadBadge,
} from '@chatic/web-ui-kit';

import { useDmPeers, type DmPeer } from '../../channels/hooks';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import type { ChannelSortMethod } from '../../../stores/preferenceKeys';
import { ROUTES } from '../../../routes/paths';
import { useLastChats } from '../../../hooks/useLastChats';
import { useChannelUnreads, useMyProfile } from '../../../hooks';
import { resolveChannelAvatar, resolveChannelTitle } from '../../channels/lib';
import { toPlainPreview } from '../../channels/utils/messageTokens';
import { sortChannels } from '../../../utils/sortChannels';
import { InviteChannelRow } from '../../invite/components/InviteChannelRow';
import { ChannelEmptyState } from './ChannelEmptyState';

/**
 * One placeholder row. The pulse lives on the ROW (not each bar) and is offset per row, so three
 * of them read as a wave travelling down the list — motion that says "still arriving" rather than
 * three identical blocks breathing in lockstep.
 */
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
    lastChat,
}: {
    channel: DomainChannel;
    unread: number;
    myNick?: string;
    /** My place-profile photo — the self-chat row's avatar (see resolveChannelAvatar). */
    myThumbnail?: string;
    joinNick?: string;
    uid?: string;
    /** The 1:1 peer for this row (from the list-level useDmPeers). Undefined for non-DM rows. */
    dmPeer?: DmPeer;
    /** Pinned in this place (client preference) — shown as a pin glyph next to the time. */
    pinned?: boolean;
    /** Room notifications off (my join's notify === 'none', ADR-0025) — shown as a bell-off glyph. */
    muted?: boolean;
    /**
     * This row's last-message preview, from the ONE list-level useLastChats subscription
     * (ADR-0057) — not a per-row cache window. Undefined when the channel has nothing to preview.
     */
    lastChat?: DomainChat;
}) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const blurLastMessage = usePreferenceStore(s => s.blurLastMessage);
    // Self-chat is identified by stereo (ADR-0026), not member count.
    const isSelf = channel.stereo === 'self';
    // 1:1 DM (stereo): the row shows the peer, not the channel — its own name/photo/member count
    // are all either absent or meaningless (ADR-0039).
    const isDm = channel.stereo === 'dm';

    // Keep the channel metadata synced while rendered (unregisters on unmount). The read
    // boundary that drives the unread badge rides along on the channel as `$join.chatNo`, and
    // the polled `chatNo` head doubles as the chat catch-up trigger (useChatSyncRegistration).
    useChannelSync(channel.id);

    const formatTime = (dateValue?: string | number) => {
        if (!dateValue) return '';
        const date = new Date(dateValue);
        const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    };

    // Title by channel type — shared with the chat-room management list (see resolveChannelTitle).
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

    // Preview / time reflect the LAST MESSAGE only. With no messages both stay empty so no stale
    // preview or timestamp shows (the message line is hidden).
    //
    // A tombstone still previews — it IS the channel's last message, and the room now renders it
    // the same way, so the two screens agree (ADR-0047 decision 6). What it must not do is show
    // the deleted body, hence the shared phrase rather than `content`.
    //
    // Code markup is flattened, not rendered: a one-line row has nowhere to put a code block, and
    // leaving the backticks in would make the list dirtier than before code was supported. No badge
    // or monospace either — that would complicate the row and tangle with blurLastMessage (ADR-0055).
    const preview = lastChat?.hidden ? t('chat.room.deletedMessage') : toPlainPreview(lastChat?.content ?? '');
    const time = lastChat?.createdAt ? formatTime(lastChat.createdAt) : '';

    // Self → my place-profile photo, DM → the peer's, else the channel photo — one shared rule with
    // the room header / settings / manage list, which also decides the placeholder glyph (a group
    // room gets the two-person glyph, not the one-person default).
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
                    {/* Group member count — an inline gray pill after the name (Figma 2931-8611).
                        Hidden for a DM: it is always 2, so the number carries no information. */}
                    {!isDm && (channel.memberNo ?? 0) > 1 && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
                            {channel.memberNo}
                        </span>
                    )}
                    {/* Row-state glyphs sit together after the name: pinned first (it decides the
                        row's position), then muted. */}
                    {pinned && (
                        <IconPin
                            size={12}
                            filled
                            role="img"
                            aria-label={t('channelList.pinned')}
                            // The kit's glyphs are decorative by default; this one is announced.
                            aria-hidden={false}
                            className="shrink-0 text-control-idle"
                        />
                    )}
                    {muted && (
                        <BellOff
                            role="img"
                            aria-label={t('channelList.muted')}
                            className="size-3.5 shrink-0 text-muted-foreground"
                        />
                    )}
                </>
            }
            subtitle={
                preview ? (
                    blurLastMessage ? (
                        <span className="select-none blur-[5px]">{preview}</span>
                    ) : (
                        preview
                    )
                ) : undefined
            }
            trailing={
                <div className="flex flex-col items-end gap-1">
                    <span className="text-[12px] leading-4 text-description">{time}</span>
                    <UnreadBadge count={unread} variant="pill" />
                </div>
            }
            // Hand the row's channel across so the room renders its header instantly instead of
            // re-resolving a row that was just on screen (ADR-0058; same pattern as openThread).
            onClick={() => navigate(ROUTES.channels.room(channel.id), { state: { channel } })}
        />
    );
};

interface ChannelListProps {
    channels: DomainChannel[];
    /** My join per channel (subscribed join list) — supplies the self-chat title nick. */
    joinByChannel?: Map<string, DomainJoin>;
    /**
     * Active place id — scopes the one profile subscription that names every DM row. Required, not
     * optional: forgetting it fails silently (every DM row quietly falls back to `channel.name` or
     * the unnamed label), which is the drift this list exists to avoid.
     */
    sid: string;
    isLoading: boolean;
    /** Show the create (＋) popover in the section header. */
    canCreate?: boolean;
    /** Relay adds "1:1 대화" above "그룹 방 만들기"; a cloud offers only the latter. */
    isDefaultCloud?: boolean;
    /** Drives the PRO badge on "그룹 방 만들기" — and, on relay, whether that entry shows at all. */
    isPro?: boolean;
    /** Sort method for this place's channel list (client preference). Defaults to 'recent'. */
    sortMethod?: ChannelSortMethod;
    /** Channel ids pinned in this place (client preference) — pinned rows float to the top. */
    pinnedChannelIds?: ReadonlySet<string>;
    /** Relay: start a 1:1 chat — navigates to the contact-invite page (ADR-0033 Track B). */
    onCreateOneOnOne?: () => void;
    /** Cloud: create a group room (host applies the PRO gate). */
    onCreateGroup?: () => void;
    /**
     * True while connected to an INVITED cloud — the member cannot create rooms here, so the empty
     * body explains that rooms arrive by invitation and offers the place-info exit instead of a
     * create nudge (Figma 3717:23857).
     */
    isInvitedPlace?: boolean;
    /** Invited empty state only: opens this place's settings hub ("플레이스 정보 바로가기"). */
    onOpenPlaceInfo?: () => void;
    /**
     * Sent relay invites still worth a row — `pending`/`expired` only (ADR-0033 Track B). The
     * host is expected to pass `[]` outside the default cloud, where 1:1 invites don't apply.
     */
    sentInvites?: MyInviteView[];
    /** Tapping an invite row — the host navigates to that invite's waiting screen. */
    onSelectInvite?: (inviteId: string) => void;
}

export const ChannelList = ({
    channels,
    joinByChannel,
    sid,
    isLoading,
    canCreate,
    isDefaultCloud,
    isPro,
    sortMethod = 'recent',
    pinnedChannelIds,
    onCreateOneOnOne,
    onCreateGroup,
    isInvitedPlace,
    onOpenPlaceInfo,
    sentInvites = [],
    onSelectInvite,
}: ChannelListProps) => {
    const { t } = useTranslation();
    // My active-site profile — the self-chat title fallback AND the self-chat row's avatar. Resolved
    // once here (not per row) since useMyProfile triggers a fetch.
    const { profile: myProfile } = useMyProfile();
    const myNick = myProfile?.nick;
    const myThumbnail = myProfile?.thumbnail;
    // My user id drives the owner-vs-member title branch (channel.ownerId === uid).
    const { userId: uid } = useSessionIdentity();
    // Unread is derived directly from the channel stream plus my join stream passed from HomePage.
    const { byChannel: unreadByChannel } = useChannelUnreads(channels, joinByChannel);
    // 1:1 peers for every DM row, named by ONE list-level profile subscription (not one per row).
    const dmPeers = useDmPeers(sid, channels, uid);
    // Last-message previews for every row, from ONE combined observation (ADR-0057): the whole
    // list costs a single bridge round trip on a current app, and per-row chat sync targets are
    // gone with it. This read stays PURE — freshness (live push + head-triggered catch-up) is owned
    // by the host's useChatSyncRegistration, so rendering a row never makes a network call.
    const lastChats = useLastChats(channels);

    // Order by the place's chosen sort method ('unread' floats unread channels above). The base
    // order is the last message's time, read from the same `lastChats` map the rows render — so the
    // order and the previews can never tell two different stories. See sortChannels (unit-tested).
    const sortedChannels = useMemo(
        () => sortChannels({ channels, lastChatByChannel: lastChats, unreadByChannel, sortMethod, pinnedChannelIds }),
        [channels, lastChats, unreadByChannel, sortMethod, pinnedChannelIds]
    );

    // "그룹 방 만들기" is the real action on a cloud; on relay it rides along ONLY as an upsell for
    // an unpaid account (Figma 2870:20387) — a group room lives in a cloud of one's own, so for a
    // subscriber the relay entry would lead nowhere and is dropped. What the tap does is the host's
    // call (see HomePage.handleCreateGroup).
    const showGroupCreate = !isDefaultCloud || !isPro;

    const createMenu = canCreate ? (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={t('channelList.createChat', '채팅 만들기')}
                    className="flex size-6 items-center justify-center text-foreground"
                >
                    <IconChatAdd className="size-[18px]" />
                </button>
            </DropdownMenuTrigger>
            {/* Popover metrics are the design's, not the ui-kit menu defaults (Figma 2931:8181):
                the sheet HUGS its rows instead of sitting at a fixed 184px — with one entry that
                left a wide empty gutter — over a translucent, blurred surface with a soft 32px
                shadow, 16px corners, a 6px inner gutter and 12/10px rows. `min-w-0` is what
                releases the kit's 8rem floor; the transform origin makes it scale out of the ＋
                button it belongs to rather than out of its own centre. */}
            <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="min-w-0 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-2xl border-[0.5px] border-input-border/70 bg-popover/90 p-1.5 shadow-[0_3px_32px_0_rgba(0,0,0,0.08)] backdrop-blur-[4px] duration-150 ease-out"
            >
                {isDefaultCloud && (
                    <DropdownMenuItem
                        onClick={onCreateOneOnOne}
                        className="cursor-pointer whitespace-nowrap rounded-[10px] px-3 py-2.5 text-[14px] font-medium leading-4 tracking-[-0.14px]"
                    >
                        {t('channelList.createDirect', '1:1 대화')}
                    </DropdownMenuItem>
                )}
                {showGroupCreate && (
                    <DropdownMenuItem
                        onClick={onCreateGroup}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded-[10px] px-3 py-2.5 text-[14px] font-medium leading-4 tracking-[-0.14px]"
                    >
                        {/* The design leaves no slack in this row (label + badge fill it exactly), so the
                            label must not wrap. */}
                        <span className="whitespace-nowrap">{t('channelList.createGroup', '그룹 방 만들기')}</span>
                        {!isPro && <SubscriptionBadge tier="pro" size="xs" />}
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    ) : undefined;

    return (
        // While the list is still loading, the count is not "0" — it is unknown. Showing 0 next to
        // a skeleton claims an answer we don't have yet, so the number is withheld until it lands.
        <CollapsibleSection
            title={t('homePage.channels', '채널')}
            count={isLoading ? undefined : channels.length}
            actions={createMenu}
        >
            {/* Sent-invite rows float above real channels — they are the newest, most actionable
                entries, same spirit as a pinned channel. See useInviteListRows for what qualifies. */}
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
                sentInvites.length === 0 && (
                    <ChannelEmptyState
                        variant={isInvitedPlace ? 'invited' : 'owner'}
                        onOpenPlaceInfo={onOpenPlaceInfo}
                    />
                )
            ) : (
                sortedChannels.map(channel => (
                    <ChannelItem
                        key={channel.id}
                        channel={channel}
                        unread={unreadByChannel[channel.id] ?? 0}
                        myNick={myNick}
                        myThumbnail={myThumbnail}
                        joinNick={joinByChannel?.get(channel.id)?.nick}
                        uid={uid ?? undefined}
                        dmPeer={dmPeers.get(channel.id)}
                        pinned={pinnedChannelIds?.has(channel.id) ?? false}
                        // The mute state lives on my join row, same source the settings toggle
                        // writes through (join.update) — not the channel's embedded $join.
                        muted={joinByChannel?.get(channel.id)?.notify === 'none'}
                        lastChat={lastChats.get(channel.id)}
                    />
                ))
            )}
        </CollapsibleSection>
    );
};
