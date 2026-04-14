import { User, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';

import { useWebSocketV2Store } from '@chatic/socket';
import { useNavigateWithTransition } from '@chatic/shared';
import { cloudCore, useDynamicProfile } from '@chatic/web-core';

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
    const navigate = useNavigateWithTransition();
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
                        <User size={20} className="text-muted-foreground" />
                    ) : (
                        <Users size={20} className="text-muted-foreground" />
                    )}
                </div>
                {(channel.memberNo ?? 0) > 1 && (
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
                            {isSelf ? t('channelList.selfChannel') : channel.name || t('channelList.unnamedChannel')}
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
    showCreateButton?: boolean;
    isChannelsLoading?: boolean;
    onCreateChannel?: () => void;
    channelLimit?: number;
}

export const ChannelList = ({
    workspaceId: _workspaceId,
    showCreateButton,
    isChannelsLoading: _isChannelsLoading,
    onCreateChannel,
    channelLimit,
}: ChannelListProps) => {
    const { t } = useTranslation();
    const { channels, isLoading, isError, retry } = useMyChannels();
    const wssType = useWebSocketV2Store(s => s.wssType);
    const hasSelectedPlace = wssType !== 'cloud' || !!cloudCore.getSelectedPlaceId();

    if (!hasSelectedPlace) return null;

    const header = (
        <div className="mb-[18px] flex items-center justify-between">
            <span className="text-[18px] font-semibold leading-[1.334] tracking-[-0.003em] text-foreground">Chat</span>
            {showCreateButton && (
                <div className="flex items-center gap-[6px]">
                    {channelLimit != null && (
                        <span className="text-[12px] font-medium text-muted-foreground">
                            {channels.length}/{channelLimit}
                        </span>
                    )}
                    <button
                        onClick={onCreateChannel}
                        className="flex h-[24px] w-[24px] items-center justify-center text-foreground"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M20.0871 12.3522C19.5183 16.7033 15.2147 20.2296 10.8257 20.2296H4.50289C3.96623 20.2299 3.4689 19.9482 3.19307 19.4879C2.91725 19.0275 2.90348 18.4561 3.15681 17.983L3.41276 17.4996C3.68766 17.0314 3.68766 16.451 3.41276 15.9828C1.25812 12.5793 1.59465 8.16472 4.24031 5.1271C6.88597 2.08948 11.2125 1.15009 14.8797 2.81708C18.5468 4.48406 20.6837 8.3616 20.1345 12.3522H20.0871Z"
                                stroke="currentColor"
                                strokeWidth="1.2"
                            />
                            <path
                                d="M11.165 8V14.33M8 11.165H14.33"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );

    if (isLoading) {
        return (
            <div className="space-y-0">
                {header}
                <ChannelSkeleton />
                <ChannelSkeleton />
                <ChannelSkeleton />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex flex-col items-center gap-2 py-8">
                {header}
                <p className="text-sm text-destructive">{t('channelList.errorLoading')}</p>
                <button onClick={retry} className="text-sm text-primary underline">
                    {t('channelList.retry')}
                </button>
            </div>
        );
    }

    if (!channels.length) {
        return (
            <div>
                {header}
                <div className="py-8 text-center text-sm text-muted-foreground">{t('channelList.empty')}</div>
            </div>
        );
    }

    return (
        <div>
            {header}
            <div className="flex flex-col gap-[18px] px-1">
                {channels.map(channel => (
                    <ChannelItem key={channel.id} channel={channel} />
                ))}
            </div>
        </div>
    );
};
