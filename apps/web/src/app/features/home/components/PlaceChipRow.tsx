import { type TransitionEvent, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';
import type { DomainPlace } from '@chatic/data';

import { IconPlus, ImageAvatar, PlaceChip } from '@chatic/web-ui-kit';

import { haptics } from '../../../bridge/haptics';
import { resolvePlaceDisplayName } from '../../../utils';

interface PlaceChipItemProps {
    place: DomainPlace;
    isSelected: boolean;
    isSwitching: boolean;
    unreadCount?: number;
    onSelectPlace: (placeId: string) => void;
}

/** One place as a chip. Keeps the place record synced while shown, as the old list row did. */
const PlaceChipItem = ({ place, isSelected, isSwitching, unreadCount, onSelectPlace }: PlaceChipItemProps) => {
    const { t } = useTranslation();
    runtime.sync.usePlaceSync(place.id);

    const name = resolvePlaceDisplayName(place, { isDefaultCloud: false }, t) ?? '';
    const unread = unreadCount ?? 0;
    return (
        <PlaceChip
            name={name}
            avatar={place.thumbnail ? <ImageAvatar src={place.thumbnail} alt="" size={24} /> : undefined}
            unread={unread}
            unreadLabel={t('bottomNav.unread', { count: unread })}
            selected={isSelected}
            // A switch already under way owns the session; a second tap would race it.
            onClick={
                isSwitching
                    ? undefined
                    : () => {
                          // A tick as the row moves its fill to another place; the current one stays quiet.
                          if (!isSelected) haptics.play('selection');
                          onSelectPlace(place.id);
                      }
            }
        />
    );
};

/** The row's side padding (`px-4`) — a revealed chip keeps that margin from the edge. */
const ROW_INSET = 16;

type HorizontalRect = Pick<DOMRect, 'left' | 'right'>;

/**
 * How far the row has to scroll for `chip` to sit fully inside it, `inset` from either edge;
 * negative scrolls back. Zero when it is already inside. A chip wider than the row aligns its start.
 */
export const chipRevealDelta = (row: HorizontalRect, chip: HorizontalRect, inset: number): number => {
    if (chip.left < row.left + inset) return chip.left - (row.left + inset);
    if (chip.right > row.right - inset) {
        return Math.min(chip.right - (row.right - inset), chip.left - (row.left + inset));
    }
    return 0;
};

interface PlaceChipRowProps {
    places: DomainPlace[];
    selectedPlaceId: string | null;
    /** Unread messages per place id — each chip's pill. */
    unreadByPlace?: Record<string, number>;
    isLoading: boolean;
    isSwitching?: boolean;
    onSelectPlace: (placeId: string) => void;
    /** Owner-only: the ＋ at the end of the row. */
    onCreatePlace?: () => void;
    canAddPlace?: boolean;
}

/**
 * The home's place row — CLOUD MODE ONLY, like the section it replaces: the relay has exactly one
 * place and draws the cloud promo in this slot. Every place is a chip on one horizontally scrolling
 * line, the current one filled and named, the rest folded to their disc and unread count; the
 * owner's ＋ closes the row.
 */
export const PlaceChipRow = ({
    places: rawPlaces,
    selectedPlaceId,
    unreadByPlace,
    isLoading,
    isSwitching = false,
    onSelectPlace,
    onCreatePlace,
    canAddPlace,
}: PlaceChipRowProps) => {
    const { t } = useTranslation();
    // Relay subscription rows (`stereo === 'place'`) are not places a member switches between.
    const places = rawPlaces.filter(place => place.stereo !== 'place');
    const rowRef = useRef<HTMLDivElement>(null);
    const hasScrolledRef = useRef(false);

    // Keep the current chip in view: a place far down the row is otherwise off-screen on entry,
    // and a chip near the edge unfolds its name past it. The first placement jumps; later ones glide.
    // Scrolls the row itself, not `scrollIntoView`, which would also move the page vertically.
    const revealSelectedChip = useCallback(() => {
        const row = rowRef.current;
        const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
        if (!row || !chip) return;
        const delta = chipRevealDelta(row.getBoundingClientRect(), chip.getBoundingClientRect(), ROW_INSET);
        const glide = hasScrolledRef.current && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (delta !== 0) row.scrollBy?.({ left: delta, behavior: glide ? 'smooth' : 'auto' });
        hasScrolledRef.current = true;
    }, []);

    useEffect(() => {
        if (!isLoading) revealSelectedChip();
    }, [isLoading, selectedPlaceId, revealSelectedChip]);

    // The unfold widens the chip after the effect above ran, so look again once it has finished.
    const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
        if (event.propertyName !== 'grid-template-columns') return;
        if (!(event.target as HTMLElement).closest('[aria-pressed="true"]')) return;
        revealSelectedChip();
    };

    return (
        <div
            ref={rowRef}
            role="group"
            aria-label={t('homePage.places')}
            onTransitionEnd={handleTransitionEnd}
            className="scrollbar-hide flex shrink-0 items-center gap-2 overflow-x-auto px-4 py-2"
        >
            {isLoading ? (
                <div role="status" aria-label={t('placeList.loading')} className="flex gap-2">
                    {/* One unfolded chip, then folded ones — the shape the row settles into. */}
                    {[96, 52, 32].map((width, index) => (
                        <div
                            key={width}
                            className="h-8 animate-pulse rounded-[20px] bg-muted"
                            style={{ width, animationDelay: `${index * 150}ms` }}
                        />
                    ))}
                </div>
            ) : (
                places.map(place => (
                    <PlaceChipItem
                        key={place.id}
                        place={place}
                        isSelected={selectedPlaceId === place.id}
                        isSwitching={isSwitching}
                        unreadCount={unreadByPlace?.[place.id]}
                        onSelectPlace={onSelectPlace}
                    />
                ))
            )}
            {!isLoading && canAddPlace && onCreatePlace && (
                <button
                    type="button"
                    aria-label={t('placeList.addPlace')}
                    onClick={onCreatePlace}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full border border-avatar-stroke bg-background text-foreground"
                >
                    <IconPlus className="size-3.5" />
                </button>
            )}
        </div>
    );
};
