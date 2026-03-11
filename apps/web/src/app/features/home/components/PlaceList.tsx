import { RefreshCw, Users } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { usePlaces } from '@chatic/places';

import { useSimpleWebCore } from '@chatic/web-core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

interface PlaceItemProps {
    place: MySiteView;
    isSelected: boolean;
    onSelect: (id: string) => void;
}

const PlaceItem = ({ place, isSelected, onSelect }: PlaceItemProps) => (
    <button onClick={() => onSelect(place.id)} className="flex flex-col items-center gap-[5px]">
        <div className="relative">
            <div className="flex h-[47px] w-[47px] items-center justify-center rounded-full bg-[#F4F5F5]">
                <Users size={20} className="text-[#9FA2A7]" />
            </div>
            {isSelected && (
                <div className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-[#C139E3] bg-white">
                    <div className="h-2 w-2 rounded-full bg-[#C139E3]" />
                </div>
            )}
        </div>
        <span
            className={cn(
                'w-[60px] truncate text-center text-[14px] leading-[1.19]',
                isSelected ? 'font-medium text-foreground' : 'font-normal text-[#9FA2A7]'
            )}
        >
            {place.name}
        </span>
    </button>
);

interface PlaceListProps {
    selectedId: string | null;
    onSelect: (id: string) => void;
}

export const PlaceList = ({ selectedId, onSelect }: PlaceListProps) => {
    const { isGuest } = useSimpleWebCore();

    const { data, isError, isFetching, isRefetching, refetch } = usePlaces({}, !isGuest);

    if (isGuest) {
        return (
            <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 pb-1">
                <div className="flex flex-col items-center gap-[5px]">
                    <div className="relative">
                        <div className="flex h-[47px] w-[47px] items-center justify-center rounded-full bg-[#F4F5F5]">
                            <Users size={20} className="text-[#9FA2A7]" />
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-[#C139E3] bg-white">
                            <div className="h-2 w-2 rounded-full bg-[#C139E3]" />
                        </div>
                    </div>
                    <span className="w-[60px] truncate text-center text-[14px] font-medium leading-[1.19] text-foreground">
                        기본 플레이스
                    </span>
                </div>
            </div>
        );
    }

    if (isFetching && !isRefetching) {
        return (
            <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 py-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-[5px]">
                        <div className="h-[47px] w-[47px] animate-pulse rounded-full bg-[#F4F5F5]" />
                        <div className="h-3 w-[50px] animate-pulse rounded bg-[#F4F5F5]" />
                    </div>
                ))}
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex items-center gap-2 px-4 py-2 text-sm text-[#9FA2A7]">
                <span>플레이스를 불러오지 못했어요</span>
                <button onClick={() => refetch()} className="flex items-center gap-1 text-foreground">
                    <RefreshCw size={14} />
                    <span>재시도</span>
                </button>
            </div>
        );
    }

    const places = data?.list ?? [];

    if (places.length === 0) {
        return <p className="px-4 py-2 text-sm text-[#9FA2A7]">플레이스가 없어요</p>;
    }

    return (
        <div className="relative">
            {isRefetching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <RefreshCw size={14} className="animate-spin text-[#9FA2A7]" />
                </div>
            )}
            <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 pb-1">
                {places.map(place => (
                    <PlaceItem key={place.id} place={place} isSelected={selectedId === place.id} onSelect={onSelect} />
                ))}
            </div>
        </div>
    );
};
