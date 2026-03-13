import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Home, RefreshCw, Users } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { usePlaces } from '@chatic/places';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

import { getPlaceSession, usePlaceSession } from '../../../shared/hooks/usePlaceSession';

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
            <div className="relative h-[47px] w-[47px]">
                <div
                    className={cn(
                        'absolute left-[3px] top-[3px] flex h-[41px] w-[41px] items-center justify-center rounded-full',
                        isSelected ? 'bg-[#102346]' : 'bg-muted'
                    )}
                >
                    <Users size={20} className={isSelected ? 'text-white' : 'text-muted-foreground'} />
                </div>
                {isSelected && <div className="absolute inset-0 rounded-full border-[1.5px] border-[#C139E3]" />}
            </div>
            <div className="flex items-center justify-center gap-[2px]">
                <span
                    className={cn(
                        'max-w-[70px] truncate text-center text-[14px] tracking-[-0.018em]',
                        isSelected ? 'font-medium text-foreground' : 'font-normal text-muted-foreground'
                    )}
                >
                    {place.name}
                </span>
                {isSelected && <Check size={14} className="flex-shrink-0 text-[#90C304]" />}
            </div>
        </button>
    );
};

interface PlaceListProps {
    onPlaceSelected?: (placeId: string) => void;
}

export const PlaceList = ({ onPlaceSelected }: PlaceListProps) => {
    const { t } = useTranslation();
    const { isGuest } = useWebCoreStore();
    const { selectPlace, isPending } = usePlaceSession();
    const [selectedId, setSelectedId] = useState<string | null>(cloudCore.getSelectedPlaceId());

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
        if (getPlaceSession()) return;
        void handleSelectPlace(firstSelectable.id);
    }, [data]);

    if (isGuest) {
        return (
            <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 pb-1 pt-1">
                <div className="flex flex-col items-center gap-[5px]">
                    <div className="relative h-[47px] w-[47px]">
                        <div className="absolute left-[3px] top-[3px] flex h-[41px] w-[41px] items-center justify-center rounded-full bg-[#102346]">
                            <Home size={20} className="text-white" />
                        </div>
                        <div className="absolute inset-0 rounded-full border-[1.5px] border-[#C139E3]" />
                    </div>
                    <div className="flex items-center justify-center gap-[2px]">
                        <span className="max-w-[70px] truncate text-center text-[14px] font-medium tracking-[-0.018em] text-foreground">
                            {t('placeList.defaultPlace')}
                        </span>
                        <Check size={14} className="flex-shrink-0 text-[#90C304]" />
                    </div>
                </div>
            </div>
        );
    }

    if (isFetching && !isRefetching) {
        return (
            <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 py-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-[5px]">
                        <div className="h-[47px] w-[47px] animate-pulse rounded-full bg-muted" />
                        <div className="h-3 w-[50px] animate-pulse rounded bg-muted" />
                    </div>
                ))}
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
                <span>{t('placeList.errorLoading')}</span>
                <button onClick={() => refetch()} className="flex items-center gap-1 text-foreground">
                    <RefreshCw size={14} />
                    <span>{t('placeList.retry')}</span>
                </button>
            </div>
        );
    }

    const places = data?.list ?? [];

    if (places.length === 0) {
        return <p className="px-4 py-2 text-sm text-muted-foreground">{t('placeList.empty')}</p>;
    }

    return (
        <div className="relative">
            {isRefetching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <RefreshCw size={14} className="animate-spin text-muted-foreground" />
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
