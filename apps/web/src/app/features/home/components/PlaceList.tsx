import { useTranslation } from 'react-i18next';

import type { DomainPlace } from '@chatic/data';
import { PlaceItem } from './PlaceItem';

interface PlaceListProps {
    places: DomainPlace[];
    selectedPlaceId: string | null;
    /** unread sum per place id — a place with > 0 shows a presence dot. */
    unreadByPlace?: Record<string, number>;
    isLoading: boolean;
    isSwitching?: boolean;
    onSelectPlace: (placeId: string) => void;
    onCreatePlace?: () => void;
    isGuest?: boolean;
}

const AddPlaceButton = ({ onClick }: { onClick: () => void }) => {
    const { t } = useTranslation();
    return (
        <button onClick={onClick} className="flex flex-col items-center gap-[5px] text-muted-foreground">
            <div className="relative h-[47px] w-[47px]">
                <svg className="absolute left-[3px] top-[3px]" width="41" height="41" viewBox="0 0 41 41" fill="none">
                    <circle cx="20.5" cy="20.5" r="19.75" className="fill-background stroke-border" strokeWidth="1.5" />
                    <path
                        d="M20.5 14V27M14 20.5H27"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>
            <span className="max-w-[70px] truncate text-center text-[14px] font-normal leading-[1.19] tracking-[-0.018em]">
                {t('placeList.addPlace')}
            </span>
        </button>
    );
};

export const PlaceList = ({
    places: rawPlaces,
    selectedPlaceId,
    unreadByPlace,
    isLoading,
    isSwitching,
    onSelectPlace,
    onCreatePlace,
    isGuest,
}: PlaceListProps) => {
    const { t } = useTranslation();
    // Exclude relay subscription rows (stereo === 'place'); they are not selectable places.
    const places = rawPlaces.filter(p => p.stereo !== 'place');

    const header = (
        <div className="mb-[18px] flex items-center justify-between px-4">
            <span className="text-[18px] font-semibold leading-[1.334] tracking-[-0.003em] text-foreground">
                {t('homePage.places')}
            </span>
        </div>
    );

    if (isLoading) {
        return (
            <div>
                {header}
                <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 py-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex flex-col items-center gap-[5px]">
                            <div className="h-[47px] w-[47px] animate-pulse rounded-full bg-muted" />
                            <div className="h-3 w-[50px] animate-pulse rounded bg-muted" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            {header}
            <div className="scrollbar-hide flex gap-[14px] overflow-x-auto px-4 pb-1 pt-1">
                {places.map(place => (
                    <PlaceItem
                        key={place.id}
                        place={place}
                        isSelected={selectedPlaceId === place.id}
                        isDisabled={!!isSwitching}
                        unreadCount={unreadByPlace?.[place.id]}
                        onSelectPlace={onSelectPlace}
                    />
                ))}
                {!isGuest && onCreatePlace && <AddPlaceButton onClick={onCreatePlace} />}
            </div>
        </div>
    );
};
