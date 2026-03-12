import { useEffect, useRef, useState } from 'react';

import { RefreshCw, Users } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { usePlaces } from '@chatic/places';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

import { usePlaceSession } from '../../../shared/hooks/usePlaceSession';

interface PlaceItemProps {
    place: MySiteView;
    isSelected: boolean;
    isDisabled: boolean;
    onSelectPlace: (placeId: string) => void;
}

const PlaceItem = ({ place, isSelected, isDisabled, onSelectPlace }: PlaceItemProps) => {
    const isSelectable = place.stereo === 'place';
    const disabled = !isSelectable || isDisabled || isSelected;

    const handleClick = () => {
        if (disabled) return;
        onSelectPlace(place.id);
    };

    return (
        <button
            onClick={handleClick}
            disabled={disabled}
            className={cn('flex flex-col items-center gap-[5px]', disabled && 'cursor-not-allowed')}
        >
            <div className="relative">
                <div
                    className={cn(
                        'flex h-[47px] w-[47px] items-center justify-center rounded-full',
                        isSelected ? 'outline outline-[1.5px] outline-[#C139E3] outline-offset-1' : '',
                        isSelected ? 'bg-[#102346]' : 'bg-[#F4F5F5]'
                    )}
                >
                    <Users size={20} className="text-white" />
                </div>
            </div>
            <span
                className={cn(
                    'w-[80px] truncate text-center text-[14px] leading-[1.19]',
                    isSelected ? 'font-medium text-foreground' : 'font-normal text-[#9FA2A7]'
                )}
            >
                {place.name}
            </span>
        </button>
    );
};

interface PlaceListProps {
    onPlaceSelected?: (placeId: string) => void;
}

export const PlaceList = ({ onPlaceSelected }: PlaceListProps) => {
    const { isGuest } = useWebCoreStore();
    const { selectPlace, isPending } = usePlaceSession();
    const [selectedId, setSelectedId] = useState<string | null>(cloudCore.getSelectedPlaceId);

    const handleSelectPlace = async (placeId: string) => {
        await selectPlace(placeId);
        setSelectedId(placeId);
        onPlaceSelected?.(placeId);
    };

    const { data, isError, isFetching, isRefetching, refetch } = usePlaces({ stereo: 'place' }, !isGuest);
    const autoSelectedRef = useRef(false);

    useEffect(() => {
        if (autoSelectedRef.current) return;
        const places = data?.list ?? [];
        const firstSelectable = places.find(p => p.stereo === 'place');
        if (!firstSelectable) return;
        autoSelectedRef.current = true;
        const alreadySelected = cloudCore.getSelectedPlaceId() === firstSelectable.id;
        if (alreadySelected) {
            setSelectedId(firstSelectable.id);
            return;
        }
        void handleSelectPlace(firstSelectable.id);
    }, [data]);

    if (isGuest) {
        return (
            <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 pb-1 pt-2">
                <div className="flex flex-col items-center gap-[5px]">
                    <div className="relative">
                        <div className="flex h-[47px] w-[47px] items-center justify-center rounded-full bg-[#102346] outline outline-[1.5px] outline-[#C139E3] outline-offset-1">
                            <Users size={20} className="text-white" />
                        </div>
                    </div>
                    <span className="w-[80px] truncate text-center text-[14px] font-medium leading-[1.19] text-foreground">
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
            <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 pb-1 pt-1">
                {places.map(place => (
                    <PlaceItem
                        key={place.id}
                        place={place}
                        isSelected={selectedId === place.id}
                        isDisabled={isPending}
                        onSelectPlace={handleSelectPlace}
                    />
                ))}
            </div>
        </div>
    );
};
