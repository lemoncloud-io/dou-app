import { useEffect, useRef, useState } from 'react';

import { RefreshCw, Users } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { usePlaces } from '@chatic/places';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@chatic/ui-kit/components/ui/sheet';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

import { getCloudSession, useCloudSession } from '../../../shared/hooks/useCloudSession';

interface PlaceItemProps {
    place: MySiteView;
    isSelected: boolean;
    isDisabled: boolean;
    onSelectPlace: (placeId: string) => void;
}

const PlaceItem = ({ place, isSelected, isDisabled, onSelectPlace }: PlaceItemProps) => {
    const isSelectable = place.stereo === 'place';
    const disabled = !isSelectable || isDisabled || isSelected;

    return (
        <button
            onClick={() => !disabled && onSelectPlace(place.id)}
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

interface CloudSessionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const CloudSessionSheet = ({ open, onOpenChange }: CloudSessionSheetProps) => {
    const { isGuest } = useWebCoreStore();
    const { selectPlace, isPending } = useCloudSession();
    const [selectedId, setSelectedId] = useState<string | null>(cloudCore.getSelectedPlaceId());

    const { data, isError, isFetching, isRefetching, refetch } = usePlaces({ stereo: 'place' }, !isGuest);
    const autoSelectedRef = useRef(false);

    const handleSelectPlace = async (placeId: string) => {
        await selectPlace(placeId);
        setSelectedId(placeId);
        onOpenChange(false);
    };

    useEffect(() => {
        if (autoSelectedRef.current) return;
        const places = data?.list ?? [];
        const firstSelectable = places.find(p => p.stereo === 'place');
        if (!firstSelectable) return;
        autoSelectedRef.current = true;
        if (getCloudSession()) return;
        void handleSelectPlace(firstSelectable.id);
    }, [data]);

    const places = data?.list ?? [];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-safe-bottom pt-4">
                <SheetHeader className="mb-4">
                    <SheetTitle>클라우드 선택</SheetTitle>
                </SheetHeader>

                {isFetching && !isRefetching ? (
                    <div className="flex gap-[14px] py-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex flex-col items-center gap-[5px]">
                                <div className="h-[47px] w-[47px] animate-pulse rounded-full bg-[#F4F5F5]" />
                                <div className="h-3 w-[50px] animate-pulse rounded bg-[#F4F5F5]" />
                            </div>
                        ))}
                    </div>
                ) : isError ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-[#9FA2A7]">
                        <span>플레이스를 불러오지 못했어요</span>
                        <button onClick={() => refetch()} className="flex items-center gap-1 text-foreground">
                            <RefreshCw size={14} />
                            <span>재시도</span>
                        </button>
                    </div>
                ) : places.length === 0 ? (
                    <p className="py-2 text-sm text-[#9FA2A7]">플레이스가 없어요</p>
                ) : (
                    <div className="scrollbar-hide flex gap-[14px] overflow-x-auto pb-2">
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
                )}
            </SheetContent>
        </Sheet>
    );
};
