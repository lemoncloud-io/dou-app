import type { DomainPlace } from '@chatic/data';
import { useTranslation } from 'react-i18next';
import { cn } from '@chatic/lib/utils';
import { usePlaceSync } from '@chatic/app-runtime';
import { Check, Home, Users } from 'lucide-react';

interface PlaceItemProps {
    place: DomainPlace;
    isSelected: boolean;
    isDisabled: boolean;
    onSelectPlace: (placeId: string) => void;
    unreadCount?: number;
}

export const PlaceItem = ({ place, isSelected, isDisabled, onSelectPlace, unreadCount }: PlaceItemProps) => {
    const { t } = useTranslation();
    // Register this place as a sync target while it is rendered; the runtime keeps its
    // metadata (name, thumbnail, …) live and unregisters on unmount.
    usePlaceSync(place.id);

    const isDefaultPlace = place.id === 'default';
    const disabled = isDisabled || isSelected;
    const displayName = isDefaultPlace ? t('placeList.defaultPlace') : place.name;

    return (
        <button
            onClick={() => !disabled && onSelectPlace(place.id)}
            disabled={disabled}
            className={cn('flex flex-col items-center gap-[5px]', disabled && 'cursor-not-allowed')}
        >
            <div className="relative h-[47px] w-[47px]">
                <div
                    className={cn(
                        'absolute left-[3px] top-[3px] flex h-[41px] w-[41px] items-center justify-center overflow-hidden rounded-full',
                        isSelected ? 'bg-[#102346]' : 'bg-muted'
                    )}
                >
                    {place.thumbnail ? (
                        <img src={place.thumbnail} alt={displayName} className="h-full w-full object-cover" />
                    ) : isDefaultPlace ? (
                        <Home size={20} className={isSelected ? 'text-white' : 'text-muted-foreground'} />
                    ) : (
                        <Users size={20} className={isSelected ? 'text-white' : 'text-muted-foreground'} />
                    )}
                </div>
                {isSelected && <div className="absolute inset-0 rounded-full border-[1.5px] border-[#C139E3]" />}
                {!!unreadCount && unreadCount > 0 && (
                    <div className="absolute right-[3px] top-[3px] z-10 h-[10px] w-[10px] rounded-full bg-red-500" />
                )}
            </div>
            <div className="flex items-center justify-center gap-[2px]">
                <span
                    className={cn(
                        'max-w-[70px] truncate text-center text-[14px] tracking-[-0.018em]',
                        isSelected ? 'font-medium text-foreground' : 'font-normal text-muted-foreground'
                    )}
                >
                    {displayName}
                </span>
                {isSelected && <Check size={14} className="flex-shrink-0 text-[#90C304]" />}
            </div>
        </button>
    );
};
