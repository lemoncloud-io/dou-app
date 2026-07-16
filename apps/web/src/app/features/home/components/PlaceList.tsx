import { useTranslation } from 'react-i18next';

import type { DomainPlace } from '@chatic/data';

import { CollapsibleSection, IconPlus, ListRow } from '@chatic/web-ui-kit';

import { PlaceItem } from './PlaceItem';

interface PlaceListProps {
    places: DomainPlace[];
    selectedPlaceId: string | null;
    /** unread sum per place id — an unselected place with > 0 shows a red dot. */
    unreadByPlace?: Record<string, number>;
    isLoading: boolean;
    isSwitching?: boolean;
    onSelectPlace: (placeId: string) => void;
    onCreatePlace?: () => void;
    /** True while connected to an invited cloud — drives the place-type caption. */
    isInvitedCloud?: boolean;
    /** Owner-only: shows the "add place" row (hidden on relay / for invited users). */
    canAddPlace?: boolean;
}

export const PlaceList = ({
    places: rawPlaces,
    selectedPlaceId,
    unreadByPlace,
    isLoading,
    isSwitching,
    onSelectPlace,
    onCreatePlace,
    isInvitedCloud,
    canAddPlace,
}: PlaceListProps) => {
    const { t } = useTranslation();
    // Exclude relay subscription rows (stereo === 'place'); they are not selectable places.
    const places = rawPlaces.filter(p => p.stereo !== 'place');

    const placeSubtitle = (place: DomainPlace): string => {
        if (place.id === 'default') return t('placeList.subtitleDefault', '기본 플레이스');
        if (isInvitedCloud) return t('placeList.subtitleInvited', '초대받은 플레이스');
        return t('placeList.subtitleOwned', '내 플레이스');
    };

    if (isLoading) {
        return (
            <CollapsibleSection title={t('homePage.places')}>
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <div className="size-[46px] animate-pulse rounded-full bg-muted" />
                        <div className="flex flex-col gap-1.5">
                            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                        </div>
                    </div>
                ))}
            </CollapsibleSection>
        );
    }

    return (
        <CollapsibleSection title={t('homePage.places')} count={places.length}>
            {places.map(place => (
                <PlaceItem
                    key={place.id}
                    place={place}
                    isSelected={selectedPlaceId === place.id}
                    isDisabled={!!isSwitching}
                    unreadCount={unreadByPlace?.[place.id]}
                    onSelectPlace={onSelectPlace}
                    subtitle={placeSubtitle(place)}
                />
            ))}
            {canAddPlace && onCreatePlace && (
                <ListRow
                    leading={
                        <span className="flex size-[46px] items-center justify-center">
                            <IconPlus className="size-6 text-foreground" />
                        </span>
                    }
                    title={t('placeList.addPlace')}
                    onClick={onCreatePlace}
                />
            )}
        </CollapsibleSection>
    );
};
