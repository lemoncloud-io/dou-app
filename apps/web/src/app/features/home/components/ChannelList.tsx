import { useNavigate } from 'react-router-dom';

import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';
import { useDynamicProfile } from '@chatic/web-core';

import { useUnreadCount } from '../../chats/hooks/useUnreadCount';
import { useMyChannels } from '../hooks/useMyChannels';

import type { ChannelView } from '@lemoncloud/chatic-socials-api';

const ChannelSkeleton = () => (
    <div className="flex items-center gap-3 rounded-lg px-1 py-3.5">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
        </div>
    </div>
);

const ChannelItem = ({ channel }: { channel: ChannelView }) => {
    const navigate = useNavigate();
    const profile = useDynamicProfile();
    const unreadCount = useUnreadCount(profile?.uid ?? null, channel.id ?? '');
    const isSelf = channel.memberNo === 1;

    const formatTime = (dateValue?: string | number) => {
        if (!dateValue) return '';
        const date = new Date(dateValue);
        return date.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <button
            key={channel.id}
            onClick={() => navigate(`/chats/${channel.id}/room`)}
            className="flex w-full items-center gap-3 rounded-lg px-1 py-3.5 text-left transition-colors active:bg-muted"
        >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-muted">
                    {isSelf ? (
                        <span className="text-lg text-muted-foreground">👤</span>
                    ) : (
                        <span className="text-lg text-muted-foreground">👥</span>
                    )}
                </div>
                {channel.memberNo && (
                    <span className="absolute -left-1 -top-1 flex h-4 w-7 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                        {channel.memberNo}
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    {isSelf && (
                        <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                            MY
                        </span>
                    )}
                    <span className="truncate text-[15px] font-semibold text-foreground">
                        {channel.name || 'Unnamed Channel'}
                    </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {channel.lastChat$?.content || channel.desc || '채널 설명 없음'}
                </p>
            </div>

            {/* Time + Unread */}
            <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className="text-[11px] text-muted-foreground">
                    {formatTime(channel.lastChat$?.createdAt ?? channel.updatedAt)}
                </span>
                {unreadCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-badge-unread px-1.5 text-[11px] font-bold text-badge-unread-foreground">
                        {unreadCount}
                    </span>
                )}
            </div>
        </button>
    );
};

interface ChannelListProps {
    workspaceId?: string;
}

export const ChannelList = ({ workspaceId: _workspaceId }: ChannelListProps) => {
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
                <p className="text-sm text-destructive">채널을 불러올 수 없습니다</p>
                <button onClick={retry} className="text-sm text-primary underline">
                    다시 시도
                </button>
            </div>
        );
    }

    if (!channels.length) {
        return (
            <div className="py-8 text-center text-sm text-muted-foreground">
                채널이 없습니다. 새 채팅방을 만들어보세요!
            </div>
        );
    }

    return (
        <div className="space-y-0">
            {channels.map(channel => (
                <ChannelItem key={channel.id} channel={channel} />
            ))}
        </div>
    );
};
