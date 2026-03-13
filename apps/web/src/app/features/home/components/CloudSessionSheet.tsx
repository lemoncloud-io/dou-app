import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RefreshCw, Users } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
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
    const { t } = useTranslation();
    const { selectPlace, isPending, clouds, isCloudsError, isFetchingClouds, refetchClouds } = useCloudSession();
    const [selectedId, setSelectedId] = useState<string | null>(cloudCore.getSelectedPlaceId());

    const { isGuest } = useWebCoreStore();
    const autoSelectedRef = useRef(false);

    const handleSelectPlace = async (placeId: string) => {
        await selectPlace(placeId);
        setSelectedId(placeId);
        onOpenChange(false);
    };

    useEffect(() => {
        if (autoSelectedRef.current) return;
        const firstSelectable = clouds.find(p => p.stereo === 'place');
        if (!firstSelectable) return;
        autoSelectedRef.current = true;
        if (getCloudSession()) return;
        void handleSelectPlace(firstSelectable.id);
    }, [clouds]);

    const isLoading = isFetchingClouds && clouds.length === 0;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-safe-bottom pt-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
                <SheetHeader className="mb-4">
                    <SheetTitle>{t('cloudSessionSheet.title')}</SheetTitle>
                </SheetHeader>

                {isLoading ? (
                    <div className="flex gap-[14px] py-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex flex-col items-center gap-[5px]">
                                <div className="h-[47px] w-[47px] animate-pulse rounded-full bg-[#F4F5F5]" />
                                <div className="h-3 w-[50px] animate-pulse rounded bg-[#F4F5F5]" />
                            </div>
                        ))}
                    </div>
                ) : isCloudsError ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-[#9FA2A7]">
                        <span>{t('cloudSessionSheet.errorLoading')}</span>
                        <button onClick={() => refetchClouds()} className="flex items-center gap-1 text-foreground">
                            <RefreshCw size={14} />
                            <span>{t('cloudSessionSheet.retry')}</span>
                        </button>
                    </div>
                ) : (
                    <div className="scrollbar-hide flex gap-[14px] overflow-x-auto pb-2">
                        {clouds.map(place => (
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
