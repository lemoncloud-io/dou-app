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
    ChatAvatar,
    CollapsibleSection,
    DefaultAvatar,
    IconBolt,
    IconPlus,
    ListRow,
    PlanBadge,
    UnreadBadge,
} from '@chatic/web-ui-kit';

import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { ROUTES } from '../../../routes/paths';
import { useLastChat } from '../hooks/useLastChat';

const ChannelSkeleton = () => (
    <div className="flex items-center gap-3 px-4 py-3">
        <div className="size-[46px] animate-pulse rounded-full bg-muted" />
        <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-48 animate-pulse rounded bg-muted" />
        </div>
    </div>
);

const ChannelItem = ({ channel, unread }: { channel: DomainChannel; unread: number }) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const blurLastMessage = usePreferenceStore(s => s.blurLastMessage);
    const isSelf = channel.memberNo === 1;

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

    const name = channel.name || (isSelf ? t('channelList.selfChannel') : t('channelList.unnamedChannel'));
    const preview = lastChat?.content || channel.desc || t('channelList.noDescription');
    const time = formatTime(lastChat?.createdAt ?? channel.updatedAt);

    const leading = (
        <div className="relative">
            {channel.thumbnail ? (
                <span className="size-[46px] shrink-0 overflow-hidden rounded-full">
                    <img src={channel.thumbnail} alt="" className="size-full object-cover" />
                </span>
            ) : isSelf ? (
                <DefaultAvatar size={46} />
            ) : (
                <ChatAvatar size="md" />
            )}
            {(channel.memberNo ?? 0) > 1 && (
                <span className="absolute -left-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border border-border bg-background/80 px-[5px] text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
                    {channel.memberNo}
                </span>
            )}
        </div>
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
        <CollapsibleSection title="Chat" actions={createMenu}>
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
                    <ChannelItem key={channel.id} channel={channel} unread={unreadByChannel[channel.id] ?? 0} />
                ))
            )}
        </CollapsibleSection>
    );
};
