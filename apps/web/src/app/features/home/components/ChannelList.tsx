import { useNavigate } from 'react-router-dom';
import { usePublicChannels } from '@chatic/channels';
import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';

const ChannelSkeleton = () => (
    <div className="flex items-center gap-2.5">
        <Skeleton className="h-[39px] w-[39px] rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
        </div>
    </div>
);

export const ChannelList = () => {
    const navigate = useNavigate();
    const { data: channels, isPending, error } = usePublicChannels({ limit: -1 });

    if (isPending) {
        return (
            <div className="flex flex-col gap-[15px]">
                <ChannelSkeleton />
                <ChannelSkeleton />
                <ChannelSkeleton />
            </div>
        );
    }

    if (error) {
        return <div className="text-center text-sm text-red-500">채널을 불러올 수 없습니다</div>;
    }

    if (!channels?.list?.length) {
        return <div className="text-center text-sm text-gray-500">채널이 없습니다</div>;
    }

    return (
        <div className="flex flex-col gap-[15px]">
            {channels.list.map(channel => (
                <button
                    key={channel.id}
                    onClick={() => navigate(`/chats/${channel.id}/room`)}
                    className="flex items-center gap-2.5 w-full text-left"
                >
                    <div className="flex h-[39px] w-[39px] items-center justify-center rounded-full bg-[#F4F5F5]">
                        <div className="h-4 w-4 text-[#CFD0D3]">💬</div>
                    </div>
                    <div className="flex flex-1 items-center">
                        <div className="flex flex-1 flex-col">
                            <div className="flex items-center gap-1">
                                <span className="text-[14px] font-semibold leading-[1.57] tracking-[0.005em] text-[#171725]">
                                    {channel.name || 'Unnamed Channel'}
                                </span>
                            </div>
                            <span className="text-[12px] font-normal leading-[1.67] tracking-[0.005em] text-[#9FA2A7]">
                                {channel.desc || '채널 설명 없음'}
                            </span>
                        </div>
                        <div className="flex h-[45px] flex-col items-end gap-1">
                            <span className="w-[67px] text-right text-[10px] font-normal leading-[2] tracking-[0.005em] text-[#9CA4AB]">
                                {channel.updatedAt
                                    ? new Date(channel.updatedAt).toLocaleTimeString('ko-KR', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                      })
                                    : ''}
                            </span>
                        </div>
                    </div>
                </button>
            ))}
        </div>
    );
};
