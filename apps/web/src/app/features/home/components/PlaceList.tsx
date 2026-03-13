import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, RefreshCw, Users } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

import { getCloudSession, useCloudSession } from '../../../shared/hooks/useCloudSession';
import { useMyPlaces } from '../hooks/useMyPlaces';

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
    const { selectPlace, isPending } = useCloudSession();
    const [selectedId, setSelectedId] = useState<string | null>(cloudCore.getSelectedPlaceId());
    const { places, isLoading, isError, retry } = useMyPlaces();
    const autoSelectedRef = useRef(false);

    const handleSelectPlace = async (placeId: string) => {
        await selectPlace(placeId);
        setSelectedId(placeId);
        onPlaceSelected?.(placeId);
    };

    useEffect(() => {
        if (autoSelectedRef.current) return;
        const firstSelectable = places.find(p => p.stereo === 'place');
        if (!firstSelectable) return;
        autoSelectedRef.current = true;
        if (getCloudSession()) return;
        void handleSelectPlace(firstSelectable.id);
    }, [places]);

    if (isGuest) return null;

    if (isLoading) {
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
                <button onClick={retry} className="flex items-center gap-1 text-foreground">
                    <RefreshCw size={14} />
                    <span>{t('placeList.retry')}</span>
                </button>
            </div>
        );
    }

    if (places.length === 0) {
        return <p className="px-4 py-2 text-sm text-muted-foreground">{t('placeList.empty')}</p>;
    }

    return (
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
    );
};
