import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Home, MailPlus, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';

import type { DomainPlace } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { applyChannelOrder, usePlaceOrder } from '@chatic/shared';

import { ConfirmDialog, useSendInviteStore } from '../../channels';
import { isAtPlaceLimit, isManagedPlace, PLACE_MAX, placeFailure, type PlaceFailure } from '../utils';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '@chatic/ui-kit/components/ui/context-menu';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    Hint,
    MobileAppPointer,
    ScrollHint,
    useDebugModeStore,
    useScrollOverflow,
    toastFailure,
} from '../../../shared';
import { SortableList } from './SortableList';

interface PlaceRailProps {
    places: DomainPlace[];
    selectedPlaceId: string | null;
    unreadByPlace: Record<string, number>;
    /** Default Cloud (Guest Session): no joinable places — render the Home tile only. */
    isDefaultMode: boolean;
    /** A cloud/place switch is in flight — disable the tiles to block a second switch. */
    isSwitching?: boolean;
    onSelectPlace: (placeId: string) => void;
    /**
     * The account manages the places of the active cloud: draws the "new place" tile after the
     * list, and gives each place tile its menu.
     */
    canManagePlaces?: boolean;
    onCreatePlace?: () => void;
    onEditPlace?: (placeId: string) => void;
    /** Deletes the place, rejecting when the server refuses. Asked only after the rail has confirmed. */
    onDeletePlace?: (placeId: string) => Promise<void>;
}

// Only the failures a second try can fix say "try again"; a refusal says what it is.
const DELETE_FAILURE_KEY: Record<PlaceFailure, string> = {
    denied: 'place.delete.failed.denied',
    network: 'errors.network',
    other: 'place.delete.failed',
};

const tileInitial = (name: string): string => name.trim().charAt(0).toUpperCase() || '#';

/**
 * One managed place's context-menu items. Sending rides the relay slot, so the
 * invite entry needs no cloud gate — only a managed place to invite into.
 */
const PlaceTileMenu = ({
    place,
    disabled,
    onEditPlace,
    onDeletePlace,
}: {
    place: DomainPlace;
    disabled?: boolean;
    onEditPlace?: (placeId: string) => void;
    onDeletePlace?: () => void;
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const openPlaceInvite = useSendInviteStore(s => s.openPlace);
    return (
        <>
            {onEditPlace && (
                <ContextMenuItem disabled={disabled} onSelect={() => onEditPlace(place.id)}>
                    <Pencil size={14} aria-hidden />
                    {t('place.edit.action')}
                </ContextMenuItem>
            )}
            <ContextMenuItem disabled={disabled} onSelect={() => navigate(`/places/${place.id}/settings`)}>
                <SlidersHorizontal size={14} aria-hidden />
                {t('place.settings.open')}
            </ContextMenuItem>
            <ContextMenuItem disabled={disabled} onSelect={() => openPlaceInvite(place.id, place.name ?? place.id)}>
                <MailPlus size={14} aria-hidden />
                {t('invite.send.open')}
            </ContextMenuItem>
            {/* Locked during a switch as well: deleting the place
                the session is in starts a switch of its own. */}
            {onDeletePlace && (
                <ContextMenuItem
                    disabled={disabled}
                    onSelect={onDeletePlace}
                    className="text-destructive focus:text-destructive"
                >
                    <Trash2 size={14} aria-hidden />
                    {t('place.delete.action')}
                </ContextMenuItem>
            )}
        </>
    );
};

interface PlaceTileProps {
    id: string;
    name: string;
    thumbnail?: string;
    /** Optional line-glyph (e.g. Home) used in place of an avatar/initial. */
    glyph?: ReactNode;
    isActive: boolean;
    unread: number;
    /** Accessible name while the place has unread messages. */
    unreadLabel?: string;
    isSwitching?: boolean;
    onSelect: (placeId: string) => void;
    /** The tile's menu items. A tile without them has no menu at all. */
    menu?: ReactNode;
}

/** One place: a 48px icon box with the name under it. The active place fills with the
 *  brand lime, as the design draws it; the others stay on the rail until hovered. */
const PlaceTile = ({
    id,
    name,
    thumbnail,
    glyph,
    isActive,
    unread,
    unreadLabel,
    isSwitching,
    onSelect,
    menu,
}: PlaceTileProps) => {
    const tile = (
        <Hint label={name}>
            <button
                onClick={() => onSelect(id)}
                disabled={isSwitching}
                aria-label={unread > 0 ? unreadLabel : name}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                    'group flex w-full flex-col items-center gap-1 rounded-lg focus-ring',
                    isSwitching && 'cursor-not-allowed',
                    isSwitching && !isActive && 'opacity-40'
                )}
            >
                <span className="relative">
                    <span
                        className={cn(
                            'flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl font-bold text-rail-foreground transition-colors duration-150 ease-tactile tactile',
                            // The cloud tile's scale (Figma): one glyph large, two a step down.
                            Array.from(tileInitial(name)).length > 1 ? 'text-lead' : 'text-headline',
                            isActive ? 'bg-primary text-primary-foreground' : 'bg-transparent group-hover:bg-border'
                        )}
                    >
                        {thumbnail ? (
                            <img src={thumbnail} alt="" className="h-full w-full object-cover" />
                        ) : glyph ? (
                            glyph
                        ) : (
                            tileInitial(name)
                        )}
                    </span>
                    {/* A dot, as on the cloud switcher and channel rows. A count here summed
                    messages across rows that only dot, so "12" pointed at nothing a
                    row inside would admit to. */}
                    {unread > 0 && (
                        <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-rail-elevated bg-badge-unread" />
                    )}
                </span>
                <span
                    className={cn(
                        // Every label reads in the rail's ink (Figma); the tile's fill marks the open place.
                        'max-w-full truncate text-callout font-medium leading-tight text-rail-foreground'
                    )}
                >
                    {name}
                </span>
            </button>
        </Hint>
    );
    if (!menu) return tile;
    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                {/* Plain wrapper, as on the channel rows: composing the Radix trigger onto Hint's
                    own trigger drops onContextMenu. */}
                <div className="contents">{tile}</div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">{menu}</ContextMenuContent>
        </ContextMenu>
    );
};

/**
 * The place tiles. Each icon is a place (a site within the active cloud); selecting
 * one runs the place switch. The signed-in user's menu lives on the nav rail.
 */
export const PlaceRail = ({
    places,
    selectedPlaceId,
    unreadByPlace,
    isDefaultMode,
    isSwitching,
    onSelectPlace,
    canManagePlaces,
    onCreatePlace,
    onEditPlace,
    onDeletePlace,
}: PlaceRailProps) => {
    const { t } = useTranslation();

    // The place the delete confirmation is about, and whether it is showing. Two values: the place
    // is kept after the close so the title still names it while the dialog fades out.
    const [deleteTarget, setDeleteTarget] = useState<DomainPlace | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    // Set before the first await, so it is already true when the confirm button's own close runs
    // in the same click. The state above only arrives with the next render, too late for both that
    // close and a second click.
    const deleting = useRef(false);

    // The confirmation names a place of the cloud it was opened in. When that place leaves the
    // list (a cloud change replaces the list) the question no longer has a subject, and its id
    // must not be sent to whichever cloud the session is in now.
    const deleteTargetListed = !!deleteTarget && places.some(place => place.id === deleteTarget.id);
    useEffect(() => {
        if (confirmingDelete && !deleteTargetListed && !deleting.current) setConfirmingDelete(false);
    }, [confirmingDelete, deleteTargetListed]);

    const askToDelete = (place: DomainPlace) => {
        setDeleteTarget(place);
        setConfirmingDelete(true);
    };

    const runDelete = async () => {
        // A switch that began under the open confirmation locks it as it locks the menu: deleting
        // the place the session is in would start a second one.
        if (!deleteTarget || !deleteTargetListed || !onDeletePlace || deleting.current || isSwitching) return;
        deleting.current = true;
        setIsDeleting(true);
        try {
            await onDeletePlace(deleteTarget.id);
            toast({ title: t('toast.placeDeleted') });
        } catch (error) {
            // The place is still there: the row is only dropped once the server has agreed.
            toastFailure(t(DELETE_FAILURE_KEY[placeFailure(error, 'DeletePlace')]), error);
        } finally {
            deleting.current = false;
            setIsDeleting(false);
            setConfirmingDelete(false);
        }
    };

    // Hidden gesture: tap the rail divider 7× (within 1.5s between taps) to toggle
    // developer debug mode. When on, the Debug menu (which opens the debug overlay)
    // appears even in packaged/prod builds; tapping 7× again turns it off.
    const toggleDebug = useDebugModeStore(s => s.toggle);
    const tapRef = useRef({ count: 0, last: 0 });
    const placeScroll = useScrollOverflow<HTMLDivElement>();

    // The order the user dragged the tiles into, kept per cloud: a place id means nothing outside
    // its cloud. Every place on the rail is the active cloud's, so the first one names it.
    const { storedIds, set: setStoredOrder } = usePlaceOrder(places[0]?.cid ?? null);
    const placeById = new Map(places.map(place => [place.id, place]));
    const ordered = applyChannelOrder(
        places.map(place => place.id),
        storedIds
    ).flatMap(id => placeById.get(id) ?? []);

    // At the cap the tile stays and the click says why: a tile that vanished would only raise
    // "where did it go". More room is another cloud, and those are made in the mobile app.
    const onCreateTile = () => {
        if (isAtPlaceLimit(places)) {
            toast({ title: t('place.create.limit', { max: PLACE_MAX }), description: <MobileAppPointer /> });
            return;
        }
        onCreatePlace?.();
    };

    const onSecretTap = () => {
        const now = Date.now();
        const taps = tapRef.current;
        taps.count = now - taps.last < 1500 ? taps.count + 1 : 1;
        taps.last = now;
        if (taps.count >= 7) {
            taps.count = 0;
            const next = toggleDebug();
            toast({ variant: 'info', title: t(next ? 'debug.mode.on' : 'debug.mode.off') });
        }
    };

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col items-center">
            {/* Divides the cloud switcher above from the places. */}
            <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={onSecretTap}
                className="flex w-full shrink-0 cursor-default justify-center py-5"
            >
                <span className="h-px w-8 bg-hairline" />
            </button>
            {/* overflow-y:auto clips overflow-x too — the pt/px give the -top/-right unread
                badge room inside the clip box instead of slicing it. */}
            <div className="relative flex min-h-0 w-full flex-1 flex-col">
                {placeScroll.above && <ScrollHint edge="top" surface="rail-elevated" />}
                <div
                    ref={placeScroll.ref}
                    className="-mt-2 flex w-full flex-1 flex-col items-stretch gap-4 overflow-y-auto scrollbar-hide px-1 pt-2"
                >
                    {isDefaultMode ? (
                        // Home / Guest: no joinable places, but show the default Home place
                        // so the rail is never empty and the active place stays visible.
                        <PlaceTile
                            id="default"
                            name={t('place.home')}
                            glyph={<Home size={22} strokeWidth={2} aria-hidden />}
                            isActive
                            unread={0}
                            onSelect={onSelectPlace}
                        />
                    ) : (
                        <>
                            {ordered.length > 0 && (
                                <SortableList
                                    items={ordered.map(place => ({
                                        key: place.id,
                                        node: (
                                            <PlaceTile
                                                id={place.id}
                                                name={place.name ?? place.id}
                                                thumbnail={place.thumbnail}
                                                isActive={place.id === selectedPlaceId}
                                                unread={unreadByPlace[place.id] ?? 0}
                                                unreadLabel={t('rail.placeUnread', { name: place.name ?? place.id })}
                                                isSwitching={isSwitching}
                                                onSelect={onSelectPlace}
                                                menu={
                                                    // The relay subscription row shares the list and is nobody's
                                                    // to edit or delete, so it gets no menu.
                                                    canManagePlaces &&
                                                    isManagedPlace(place) &&
                                                    (onEditPlace || onDeletePlace) ? (
                                                        <PlaceTileMenu
                                                            place={place}
                                                            disabled={isSwitching}
                                                            onEditPlace={onEditPlace}
                                                            onDeletePlace={
                                                                onDeletePlace ? () => askToDelete(place) : undefined
                                                            }
                                                        />
                                                    ) : undefined
                                                }
                                            />
                                        ),
                                    }))}
                                    // A drag that ends mid-switch would redraw the rail under the handshake.
                                    disabled={isSwitching}
                                    className="flex flex-col items-stretch gap-4"
                                    onReorder={setStoredOrder}
                                />
                            )}
                            {/* After the list, where a new place will land. A switch in flight locks
                                it with the tiles: the dialog ends in a switch of its own. */}
                            {canManagePlaces && onCreatePlace && (
                                <PlaceTile
                                    id="create-place"
                                    name={t('place.create.open')}
                                    glyph={<Plus size={22} strokeWidth={2} aria-hidden />}
                                    isActive={false}
                                    unread={0}
                                    isSwitching={isSwitching}
                                    onSelect={onCreateTile}
                                />
                            )}
                        </>
                    )}
                </div>
                {placeScroll.below && <ScrollHint edge="bottom" surface="rail-elevated" />}
            </div>

            <ConfirmDialog
                open={confirmingDelete}
                // The confirm button closes the dialog as part of its click. While a delete runs
                // that close is refused, so the confirmation stays up, locked, until the answer.
                onOpenChange={open => !open && !deleting.current && setConfirmingDelete(false)}
                title={t('place.delete.title', { name: deleteTarget?.name ?? '' })}
                description={t('place.delete.description')}
                confirmLabel={t('place.delete.confirm')}
                onConfirm={() => void runDelete()}
                // Locked during a switch too, so the confirm cannot be pressed into the early return above.
                isPending={isDeleting || !!isSwitching}
            />
        </div>
    );
};
