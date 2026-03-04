import { Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';
import { useSimpleWebCore } from '@chatic/web-core';
import { useUnreadCount } from '../../chats/hooks/useUnreadCount';
import { useMyChannels } from '../hooks/useMyChannels';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';

const ChannelSkeleton = () => (
    <div className="flex items-center gap-2.5">
        <Skeleton className="h-[39px] w-[39px] rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
        </div>
    </div>
);

const ChannelItem = ({ channel }: { channel: ChannelView }) => {
    const navigate = useNavigate();
    const { profile } = useSimpleWebCore();
    const unreadCount = useUnreadCount(profile?.id ?? null, channel.id ?? '');

    return (
        <button
            key={channel.id}
            onClick={() => navigate(`/chats/${channel.id}/room`)}
            className="flex items-center gap-2.5 w-full text-left"
        >
            <div className="flex h-[39px] w-[39px] shrink-0 rounded-full bg-[#F4F5F5]" />
            <div className="flex flex-1 items-center min-w-0">
                <div className="flex flex-1 flex-col min-w-0">
                    <div className="flex items-center gap-1">
                        <span className="text-[14px] font-semibold leading-[1.57] tracking-[0.005em] text-[#171725]">
                            {channel.name || 'Unnamed Channel'}
                        </span>
                        {channel.memberNo ? (
                            <div className="flex items-center gap-0.5 bg-[#EEF2FF] px-1.5 py-0.5 rounded-full">
                                <Users className="w-3 h-3 text-[#4F6EF7]" />
                                <span className="text-[11px] font-semibold text-[#4F6EF7]">{channel.memberNo}</span>
                            </div>
                        ) : null}
                    </div>
                    <span className="text-[12px] font-normal leading-[1.67] tracking-[0.005em] text-[#9FA2A7] truncate">
                        {channel.lastChat$?.content || channel.desc || '채널 설명 없음'}
                    </span>
                </div>
                <div className="flex h-[45px] shrink-0 flex-col items-end gap-1">
                    <span className="w-[67px] text-right text-[10px] font-normal leading-[2] tracking-[0.005em] text-[#9CA4AB]">
                        {(channel.lastChat$?.createdAt ?? channel.updatedAt)
                            ? new Date(channel.lastChat$?.createdAt ?? channel.updatedAt!).toLocaleTimeString('ko-KR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })
                            : ''}
                    </span>
                    {unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
                            {unreadCount}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
};

export const ChannelList = () => {
    const { channels, isLoading, isError } = useMyChannels();

    if (isLoading) {
        return (
            <div className="flex flex-col gap-[15px]">
                <ChannelSkeleton />
                <ChannelSkeleton />
                <ChannelSkeleton />
            </div>
        );
    }

    if (isError) {
        return <div className="text-center text-sm text-red-500">채널을 불러올 수 없습니다</div>;
    }

    if (!channels.length) {
        return <div className="text-center text-sm text-gray-500">채널이 없습니다</div>;
    }

    return (
        <div className="flex flex-col gap-[15px]">
            {channels.map(channel => (
                <ChannelItem key={channel.id} channel={channel} />
            ))}
        </div>
    );
};
