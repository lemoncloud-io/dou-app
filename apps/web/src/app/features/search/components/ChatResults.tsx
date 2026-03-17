import { MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useDynamicProfile } from '@chatic/web-core';

import { useNavigateWithTransition } from '@chatic/shared';

import { useUnreadCount } from '../../chats/hooks/useUnreadCount';

import type { ChatSearchResult } from '../hooks/useSearch';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';

interface ChatItemProps {
    channel: ChannelView;
    matchCount: number;
    onSelect?: (channelId: string) => void;
}

const ChatItem = ({ channel, matchCount, onSelect }: ChatItemProps) => {
    const { i18n } = useTranslation();
    const navigate = useNavigateWithTransition();

    const handleClick = () => {
        if (onSelect && channel.id) {
            onSelect(channel.id);
        } else {
            navigate(`/chats/${channel.id}/room`);
        }
    };
    const profile = useDynamicProfile();
    const unreadCount = useUnreadCount(profile?.uid ?? null, channel.id ?? '');

    const formatTime = (dateValue?: string | number) => {
        if (!dateValue) return '';
        const date = new Date(dateValue);
        const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
        return date.toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <button
            onClick={handleClick}
            className="flex w-full items-start gap-2 rounded-[6px] px-[2px] py-2 text-left transition-colors active:bg-muted"
        >
            {/* Avatar */}
            <div className="relative shrink-0">
                <div className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                    <span className="text-base text-muted-foreground">{channel.memberNo === 1 ? '👤' : '👥'}</span>
                </div>
                {matchCount > 0 && (
                    <span className="absolute -left-[2px] -top-[2px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full border border-[#90C304] bg-background/75 px-[5px] text-[11px] font-medium tracking-[-0.025em] text-muted-foreground shadow-sm backdrop-blur-sm">
                        {matchCount > 99 ? '99+' : matchCount}
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex min-w-0 flex-1 gap-2">
                <div className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold tracking-[-0.025em] text-foreground">
                        {channel.name || 'Unnamed'}
                    </span>
                    <p className="mt-1 truncate text-[13.5px] leading-[1.2] tracking-[-0.025em] text-muted-foreground">
                        {channel.lastChat$?.content || channel.desc || ''}
                    </p>
                </div>

                {/* Time + Unread */}
                <div className="flex h-[45px] shrink-0 flex-col items-end gap-1">
                    <span className="text-[12px] leading-[20px] tracking-[-0.015em] text-muted-foreground">
                        {formatTime(channel.lastChat$?.createdAt ?? channel.updatedAt)}
                    </span>
                    {unreadCount > 0 && (
                        <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-[8.5px] bg-[#F41F52] px-[5px] text-[11px] font-semibold leading-[10px] tracking-[0.005em] text-[#FEFEFE]">
                            {unreadCount > 999 ? '+999' : unreadCount}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
};

interface ChatResultsProps {
    chats: ChatSearchResult[];
    onSelect?: (channelId: string) => void;
}

export const ChatResults = ({ chats, onSelect }: ChatResultsProps) => {
    const { t } = useTranslation();

    if (chats.length === 0) return null;

    return (
        <div className="px-4 py-2">
            <div className="overflow-hidden rounded-[18px] bg-card p-4 shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)]">
                <div className="flex items-center gap-2">
                    <MessageCircle size={18} className="shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-[16px] font-semibold tracking-[-0.02em] text-foreground">
                        {t('search.chat')}
                    </span>
                </div>
                <div className="mt-3 flex flex-col gap-[15px]">
                    {chats.map(({ channel, matchCount }) => (
                        <ChatItem key={channel.id} channel={channel} matchCount={matchCount} onSelect={onSelect} />
                    ))}
                </div>
            </div>
        </div>
    );
};
