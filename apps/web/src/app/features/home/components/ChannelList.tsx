import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';
import { useDynamicProfile } from '@chatic/web-core';

import { useUnreadCount } from '../../chats/hooks/useUnreadCount';
import { useMyChannels } from '../hooks/useMyChannels';

import type { ChannelView } from '@lemoncloud/chatic-socials-api';

const ChannelSkeleton = () => (
    <div className="flex items-start gap-2 rounded-[6px] px-[2px] py-2">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex flex-1 flex-col gap-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
        </div>
    </div>
);

const ChannelItem = ({ channel }: { channel: ChannelView }) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const profile = useDynamicProfile();
    const unreadCount = useUnreadCount(profile?.uid ?? null, channel.id ?? '');
    const isSelf = channel.memberNo === 1;

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
            onClick={() => navigate(`/chats/${channel.id}/room`)}
            className="flex w-full items-start gap-2 rounded-[6px] px-[2px] py-2 text-left transition-colors active:bg-muted"
        >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                    {isSelf ? (
                        <span className="text-base text-muted-foreground">👤</span>
                    ) : (
                        <span className="text-base text-muted-foreground">👥</span>
                    )}
                </div>
                {channel.memberNo && channel.memberNo > 1 && (
                    <span className="absolute -left-[2px] -top-[2px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full border border-[#90C304] bg-background/75 px-[5px] text-[11px] font-medium tracking-[-0.025em] text-muted-foreground shadow-sm backdrop-blur-sm">
                        {channel.memberNo}
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex min-w-0 flex-1 gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-[6px]">
                        {isSelf && (
                            <span className="rounded-[3px] bg-[#102346] px-[5px] py-[3px] text-[11px] font-medium leading-none text-white">
                                MY
                            </span>
                        )}
                        <span className="truncate text-[15px] font-semibold tracking-[-0.025em] text-foreground">
                            {channel.name || t('channelList.unnamedChannel')}
                        </span>
                    </div>
                    <p className="mt-1 truncate text-[13.5px] leading-[1.2] tracking-[-0.025em] text-muted-foreground">
                        {channel.lastChat$?.content || channel.desc || t('channelList.noDescription')}
                    </p>
                </div>

                {/* Time + Unread */}
                <div className="flex h-[45px] flex-shrink-0 flex-col items-end gap-1">
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

interface ChannelListProps {
    workspaceId?: string;
}

export const ChannelList = ({ workspaceId: _workspaceId }: ChannelListProps) => {
    const { t } = useTranslation();
    // TODO: Filter channels by workspaceId when API is ready
    const { channels, isLoading, isError, retry } = useMyChannels();

    if (isLoading) {
        return (
            <div className="space-y-0">
                <ChannelSkeleton />
                <ChannelSkeleton />
                <ChannelSkeleton />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex flex-col items-center gap-2 py-8">
                <p className="text-sm text-destructive">{t('channelList.errorLoading')}</p>
                <button onClick={retry} className="text-sm text-primary underline">
                    {t('channelList.retry')}
                </button>
            </div>
        );
    }

    if (!channels.length) {
        return <div className="py-8 text-center text-sm text-muted-foreground">{t('channelList.empty')}</div>;
    }

    return (
        <div className="flex flex-col gap-[18px] px-1">
            {channels.map(channel => (
                <ChannelItem key={channel.id} channel={channel} />
            ))}
        </div>
    );
};
