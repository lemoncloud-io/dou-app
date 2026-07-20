import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useChannelSync } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

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
    IconPlus,
    ImageAvatar,
    ListRow,
    PlanBadge,
    UnreadBadge,
} from '@chatic/web-ui-kit';

import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { ROUTES } from '../../../routes/paths';
import { resolveChannelName } from '../../../utils';
import { useLastChat } from '../hooks/useLastChat';
import { useMyProfile } from '../../../hooks';
import { resolveSelfChatTitle } from '../../channels/utils/selfChatTitle';

const ChannelSkeleton = () => (
    <div className="flex items-center gap-3 px-4 py-3">
        <div className="size-[46px] animate-pulse rounded-full bg-muted" />
        <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-48 animate-pulse rounded bg-muted" />
        </div>
    </div>
);

const ChannelItem = ({ channel, unread, myNick }: { channel: DomainChannel; unread: number; myNick?: string }) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const blurLastMessage = usePreferenceStore(s => s.blurLastMessage);
    // Self-chat is identified by stereo (ADR-0022), not member count.
    const isSelf = channel.stereo === 'self';
    // For self-chat the title is the per-user join nick, falling back to my profile
    // nick (resolved once by the parent), then the "나와의 채팅" label.
    const selfChatTitle = resolveSelfChatTitle(channel.$join?.nick, myNick, t('channelList.selfChannel'));

    // Keep the channel metadata synced while rendered (unregisters on unmount). The read
    // boundary that drives the unread badge rides along on the channel as `$join.chatNo`.
    useChannelSync(channel.id);
    // Last-message preview source: the server no longer embeds `lastChat$`, so register + prime a
    // chat target for this visible row and read its latest cached message (live via ChatSyncPlan).
    const lastChat = useLastChat(channel.id);

    const formatTime = (dateValue?: string | number) => {
        if (!dateValue) return '';
        const date = new Date(dateValue);
        const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    };

    // Self-chat: join.nick → my site-profile nick → label (ADR-0026). Other rows:
    // personal room name (my join.nick) overrides the owner-set channel name.
    const name = isSelf ? selfChatTitle : resolveChannelName(channel) || t('channelList.unnamedChannel');
    const preview = lastChat?.content || channel.desc || t('channelList.noDescription');
    const time = formatTime(lastChat?.createdAt ?? channel.updatedAt);

    // No channel photo → the default person avatar (기본 아바타). Self-chat uses its
    // own solid-silhouette variant (Figma "1명 Profile"); other rows use the plain one.
    const leading = channel.thumbnail ? (
        <ImageAvatar src={channel.thumbnail} alt="" size={46} />
    ) : (
        <DefaultAvatar size={46} variant={isSelf ? 'self' : 'user'} />
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
                    {/* Group member count — an inline gray pill after the name (Figma 2931-8611). */}
                    {(channel.memberNo ?? 0) > 1 && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
                            {channel.memberNo}
                        </span>
                    )}
                </>
            }
            subtitle={blurLastMessage ? <span className="select-none blur-[5px]">{preview}</span> : preview}
            trailing={
                <div className="flex flex-col items-end gap-1">
                    <span className="text-[12px] leading-4 text-description">{time}</span>
                    <UnreadBadge count={unread} variant="pill" />
                </div>
            }
            onClick={() => navigate(ROUTES.channels.room(channel.id))}
        />
    );
};

interface ChannelListProps {
    channels: DomainChannel[];
    unreadByChannel: Record<string, number>;
    isLoading: boolean;
    /** Show the create (＋) popover in the section header. */
    canCreate?: boolean;
    /** Relay shows "1:1 대화"; a cloud shows "그룹 방 만들기". */
    isDefaultCloud?: boolean;
    /** Drives the PRO upsell badge on "그룹 방 만들기". */
    isPro?: boolean;
    /** Relay: start a 1:1 chat (not implemented yet — placeholder). */
    onCreateOneOnOne?: () => void;
    /** Cloud: create a group room (host applies the PRO gate). */
    onCreateGroup?: () => void;
}

export const ChannelList = ({
    channels,
    unreadByChannel,
    isLoading,
    canCreate,
    isDefaultCloud,
    isPro,
    onCreateOneOnOne,
    onCreateGroup,
}: ChannelListProps) => {
    const { t } = useTranslation();
    // My active-site profile nick — the self-chat title fallback. Resolved once here
    // (not per row) since useMyProfile triggers a fetch.
    const { profile: myProfile } = useMyProfile();
    const myNick = myProfile?.nick;

    const createMenu = canCreate ? (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={t('channelList.createChat', '채팅 만들기')}
                    className="flex size-6 items-center justify-center text-foreground"
                >
                    <IconPlus className="size-[18px]" />
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
            {isLoading && channels.length === 0 ? (
                <>
                    <ChannelSkeleton />
                    <ChannelSkeleton />
                    <ChannelSkeleton />
                </>
            ) : channels.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t('channelList.empty')}</div>
            ) : (
                channels.map(channel => (
                    <ChannelItem
                        key={channel.id}
                        channel={channel}
                        unread={unreadByChannel[channel.id] ?? 0}
                        myNick={myNick}
                    />
                ))
            )}
        </CollapsibleSection>
    );
};
