import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { BellOff, Pin } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import { useChannelSync } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
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
    IconBolt,
    IconChatAdd,
    ImageAvatar,
    ListRow,
    PlanBadge,
    UnreadBadge,
} from '@chatic/web-ui-kit';

import { useDmPeers, type DmPeer } from '../../channels/hooks';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import type { ChannelSortMethod } from '../../../stores/preferenceKeys';
import { ROUTES } from '../../../routes/paths';
import { useLastChats } from '../../../hooks/useLastChats';
import { useMyProfile } from '../../../hooks';
import { resolveChannelAvatar, resolveChannelTitle } from '../../channels/lib';
import { toPlainPreview } from '../../channels/utils/messageTokens';
import { sortChannels } from '../../../utils/sortChannels';
import { InviteChannelRow } from '../../invite/components/InviteChannelRow';

const ChannelSkeleton = () => (
    <div className="flex items-center gap-3 px-4 py-3">
        <div className="size-[42px] animate-pulse rounded-full bg-muted" />
        <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-48 animate-pulse rounded bg-muted" />
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
    // the polled `chatNo` head doubles as useLastChats' per-channel freshness trigger.
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
                        <Pin
                            role="img"
                            aria-label={t('channelList.pinned')}
                            className="size-3.5 shrink-0 text-muted-foreground"
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
    unreadByChannel: Record<string, number>;
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
    /** Relay shows "1:1 대화"; a cloud shows "그룹 방 만들기". */
    isDefaultCloud?: boolean;
    /** Drives the PRO upsell badge on "그룹 방 만들기". */
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
     * Sent relay invites still worth a row — `pending`/`expired` only (ADR-0033 Track B). The
     * host is expected to pass `[]` outside the default cloud, where 1:1 invites don't apply.
     */
    sentInvites?: MyInviteView[];
    /** Tapping an invite row — the host navigates to that invite's waiting screen. */
    onSelectInvite?: (inviteId: string) => void;
}

export const ChannelList = ({
    channels,
    unreadByChannel,
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
    // 1:1 peers for every DM row, named by ONE list-level profile subscription (not one per row).
    const dmPeers = useDmPeers(sid, channels, uid);
    // Last-message previews for every row, from ONE combined observation (ADR-0057): the whole
    // list costs a single bridge round trip on a current app, and per-row chat sync targets are
    // gone with it. Freshness rides on each row's channel poll (see useLastChats' head trigger).
    const lastChats = useLastChats(channels);

    // Order by the place's chosen sort method ('unread' floats unread channels above). The base
    // order is the last message's time, read from the same `lastChats` map the rows render — so the
    // order and the previews can never tell two different stories. See sortChannels (unit-tested).
    const sortedChannels = useMemo(
        () => sortChannels({ channels, lastChatByChannel: lastChats, unreadByChannel, sortMethod, pinnedChannelIds }),
        [channels, lastChats, unreadByChannel, sortMethod, pinnedChannelIds]
    );

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
            <DropdownMenuContent align="end" className="w-48">
                {isDefaultCloud ? (
                    <DropdownMenuItem onClick={onCreateOneOnOne} className="cursor-pointer">
                        {t('channelList.createDirect', '1:1 대화')}
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem
                        onClick={onCreateGroup}
                        className="flex cursor-pointer items-center justify-between gap-2"
                    >
                        <span>{t('channelList.createGroup', '그룹 방 만들기')}</span>
                        {!isPro && <PlanBadge label="PRO" accent icon={<IconBolt className="size-3.5" />} />}
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    ) : undefined;

    return (
        <CollapsibleSection title={t('homePage.channels', '채널')} count={channels.length} actions={createMenu}>
            {/* Sent-invite rows float above real channels — they are the newest, most actionable
                entries, same spirit as a pinned channel. See useInviteListRows for what qualifies. */}
            {sentInvites.map(invite => {
                const id = invite.id;
                if (!id) return null;
                return <InviteChannelRow key={id} invite={invite} onClick={() => onSelectInvite?.(id)} />;
            })}

            {isLoading && channels.length === 0 ? (
                <>
                    <ChannelSkeleton />
                    <ChannelSkeleton />
                    <ChannelSkeleton />
                </>
            ) : channels.length === 0 ? (
                sentInvites.length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">{t('channelList.empty')}</div>
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
