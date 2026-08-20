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
    /** Owner-only: shows the "add place" row (hidden for invited users). */
    canAddPlace?: boolean;
}

/**
 * Place section — CLOUD MODE ONLY. Relay never renders this list: it always has exactly one place
 * and it is auto-connected, so HomePage shows the cloud promo banner in this slot instead
 * (ADR-0034). That is why there is no `isDefaultCloud` branch here any more.
 */
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

    const placeSubtitle = (): string =>
        isInvitedCloud
            ? t('placeList.subtitleInvited', '초대받은 플레이스')
            : t('placeList.subtitleOwned', '내 플레이스');

    // No count while the list is still arriving: "플레이스 0" next to a skeleton asserts an answer
    // we don't have. The pulse is offset per row so the placeholder reads as a wave, not a blink.
    if (isLoading) {
        return (
            <CollapsibleSection title={t('homePage.places')}>
                <div role="status" aria-label={t('placeList.loading', '플레이스를 불러오는 중이에요')}>
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div
                            key={i}
                            className="flex animate-pulse items-center gap-3 px-4 py-3"
                            style={{ animationDelay: `${i * 150}ms` }}
                        >
                            <div className="size-[46px] rounded-full bg-muted" />
                            <div className="flex flex-col gap-1.5">
                                <div className="h-4 w-24 rounded bg-muted" />
                                <div className="h-3 w-16 rounded bg-muted" />
                            </div>
                        </div>
                    ))}
                </div>
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
                    // The switch pre-applies the sid, so the row that is already selected while
                    // `isSwitching` holds IS the destination — that is the one carrying the spinner.
                    isSwitchingTo={!!isSwitching && selectedPlaceId === place.id}
                    unreadCount={unreadByPlace?.[place.id]}
                    onSelectPlace={onSelectPlace}
                    subtitle={placeSubtitle()}
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
