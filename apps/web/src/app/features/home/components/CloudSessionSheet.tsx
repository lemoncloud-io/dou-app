import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RefreshCw, Users, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@chatic/ui-kit/components/ui/sheet';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';

import { getCloudSession, useCloudSession } from '../../../shared/hooks/useCloudSession';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

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
                    isSelected ? 'font-medium text-foreground' : 'font-normal text-muted-foreground'
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
    const [selectedId, setSelectedId] = useState<string | null>(cloudCore.getSelectedCloudId());

    const { isGuest } = useWebCoreStore();
    const autoSelectedRef = useRef(false);

    const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

    const handleSelectPlace = async (placeId: string) => {
        await selectPlace(placeId);
        setSelectedId(placeId);
        handleClose();
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
        <Sheet open={open} onOpenChange={open => !open && handleClose()}>
            <SheetContent side="bottom" className="rounded-t-2xl p-0 pb-safe-bottom" hideClose>
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <SheetTitle className="text-lg font-semibold text-foreground">
                        {t('cloudSessionSheet.title')}
                    </SheetTitle>
                    <button onClick={handleClose} className="p-1">
                        <X size={24} className="text-muted-foreground" />
                    </button>
                </div>
                <SheetDescription className="sr-only">{t('cloudSessionSheet.title')}</SheetDescription>

                <div className="px-5 py-4">
                    {isLoading ? (
                        <div className="flex gap-[14px]">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="flex flex-col items-center gap-[5px]">
                                    <div className="h-[47px] w-[47px] animate-pulse rounded-full bg-muted" />
                                    <div className="h-3 w-[50px] animate-pulse rounded bg-muted" />
                                </div>
                            ))}
                        </div>
                    ) : isCloudsError ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{t('cloudSessionSheet.errorLoading')}</span>
                            <button onClick={() => refetchClouds()} className="flex items-center gap-1 text-foreground">
                                <RefreshCw size={14} />
                                <span>{t('cloudSessionSheet.retry')}</span>
                            </button>
                        </div>
                    ) : (
                        <div className="scrollbar-hide flex gap-[14px] overflow-x-auto">
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
                </div>
            </SheetContent>
        </Sheet>
    );
};
