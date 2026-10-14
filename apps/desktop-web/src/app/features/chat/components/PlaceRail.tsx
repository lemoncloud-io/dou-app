import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Home, MailPlus, Pencil, Plus, SlidersHorizontal, Trash2, User } from 'lucide-react';

import type { DomainPlace } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { applyChannelOrder, usePlaceOrder } from '@chatic/shared';
import { runtime } from '@chatic/app-runtime';

import { ConfirmDialog, useSendInviteStore } from '../../channels';
import { useJoinDialogStore } from '../../auth';
import { isAtPlaceLimit, isManagedPlace, PLACE_MAX, placeFailure, type PlaceFailure } from '../utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '@chatic/ui-kit/components/ui/context-menu';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    Hint,
    MobileAppPointer,
    ScrollHint,
    useAccountName,
    useAccountResetOnLogout,
    useDebugModeStore,
    useDisplayProfile,
    useScrollOverflow,
} from '../../../shared';
import { SortableList } from './SortableList';

interface PlaceRailProps {
    places: DomainPlace[];
    selectedPlaceId: string | null;
    unreadByPlace: Record<string, number>;
    /** Default Cloud (Guest Session): no joinable places — render the profile only. */
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

/** One place, Figma Workspace Rail style: a 48px icon box with the name under it.
 *  Active = the box fills with the rail's muted tone; color stays reserved for the
 *  cloud rail and thumbnails. */
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
                            'flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-callout font-semibold text-rail-foreground transition-colors duration-150 ease-tactile tactile',
                            isActive ? 'bg-rail-muted' : 'bg-transparent group-hover:bg-rail-muted/70'
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
                    {/* A dot, as on the cloud tiles and channel rows. A count here summed
                    messages across rows that only dot, so "12" pointed at nothing a
                    row inside would admit to. */}
                    {unread > 0 && (
                        <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-rail-elevated bg-badge-unread" />
                    )}
                </span>
                <span
                    className={cn(
                        'max-w-full truncate text-callout font-medium leading-tight transition-colors',
                        // A faded label measured under AA; the quieter tone is a token that clears it.
                        isActive ? 'text-rail-foreground' : 'text-muted-foreground group-hover:text-rail-foreground'
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
                {/* Plain wrapper, as on the cloud tiles: composing the Radix trigger onto Hint's
                    own trigger drops onContextMenu. */}
                <div className="contents">{tile}</div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">{menu}</ContextMenuContent>
        </ContextMenu>
    );
};

/**
 * Second rail. Each icon is a place (a site within the active cloud); selecting
 * one runs the place switch. The signed-in user's menu is pinned to the bottom
 * (moved off the cloud rail so the profile lives with the place context).
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
    const navigate = useNavigate();
    const openJoinDialog = useJoinDialogStore(s => s.open);
    const { userId } = runtime.session.useSessionIdentity();
    const { photo } = runtime.session.useRuntimeProfile();
    const accountName = useAccountName();
    const logout = runtime.session.useSessionLogout();
    const { resetAccount } = useAccountResetOnLogout();
    // A guest account lives on this device and nothing can sign back into it, so
    // logging out of one is a delete. A main account can always come back.
    const { isGuest } = runtime.session.useRuntimeProfile();
    const [confirmingLogout, setConfirmingLogout] = useState(false);

    const runLogout = () => void resetAccount().finally(() => logout());

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
            toast({ variant: 'destructive', title: t(DELETE_FAILURE_KEY[placeFailure(error, 'DeletePlace')]) });
        } finally {
            deleting.current = false;
            setIsDeleting(false);
            setConfirmingDelete(false);
        }
    };

    // Self Display Profile: show my Place nick/photo here when set for this place.
    const { name: selfName, thumbnail: userPhoto } = useDisplayProfile(userId ?? '', accountName, photo);
    const userInitial = selfName.charAt(0).toUpperCase();

    // Hidden gesture: tap the rail divider 7× (within 1.5s between taps) to toggle
    // developer debug mode. When on, the Debug menu (which opens the debug overlay)
    // appears even in packaged/prod builds; tapping 7× again turns it off.
    const debugEnabled = useDebugModeStore(s => s.enabled);
    const toggleDebug = useDebugModeStore(s => s.toggle);
    const openDebugPanel = useDebugModeStore(s => s.setOverlayOpen);
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
        <div className="flex h-full w-full flex-col items-center">
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

            <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={onSecretTap}
                className="my-1 flex w-full shrink-0 cursor-default justify-center py-1"
            >
                <span className="h-px w-9 bg-hairline" />
            </button>

            <DropdownMenu>
                <DropdownMenuTrigger
                    aria-label={selfName ? t('rail.menu.accountMenu', { name: selfName }) : t('rail.menu.profile')}
                    className="group relative transition-transform duration-150 ease-tactile tactile focus-ring rounded-full"
                >
                    {/* Figma "1-person Profile": the navy disc and green presence dot are
                        fixed in both themes — see --profile-disc / --presence-online. */}
                    <Avatar className="h-12 w-12 rounded-full">
                        {userPhoto && <AvatarImage src={userPhoto} alt={selfName} className="rounded-full" />}
                        <AvatarFallback className="rounded-full bg-profile-disc text-heading font-semibold text-profile-disc-foreground">
                            {userInitial || <User size={17} aria-hidden />}
                        </AvatarFallback>
                    </Avatar>
                    {/* presence dot — signals "you, signed in" so the slot reads intentional, not empty */}
                    <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-rail-elevated bg-presence-online" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" sideOffset={6}>
                    {/* Who acts here: the account name and its kind. */}
                    <DropdownMenuLabel className="flex flex-col gap-0.5">
                        <span className="truncate text-callout font-medium text-foreground">
                            {selfName || t('rail.menu.profile')}
                        </span>
                        <span className="text-caption text-muted-foreground">
                            {isGuest ? t('profile.guestName') : t('account.title')}
                        </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/profile')}>{t('rail.menu.profile')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/account')}>{t('rail.menu.account')}</DropdownMenuItem>
                    {/* Guests only: the exchange refuses a signed-in account after the code
                        is typed, so a signed-in account is never shown a code field. */}
                    {isGuest && <DropdownMenuItem onClick={openJoinDialog}>{t('rail.menu.join')}</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/settings')}>{t('rail.menu.settings')}</DropdownMenuItem>
                    {/* A tool, not an account action: its own group, away from Log out. */}
                    {(import.meta.env.DEV || debugEnabled) && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openDebugPanel(true)}>
                                {t('rail.menu.debug')}
                            </DropdownMenuItem>
                        </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => (isGuest ? setConfirmingLogout(true) : runLogout())}>
                        {t('rail.menu.logout')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            {/* A guest logout is a delete: the safe way out (connect the account)
                comes first, and the destructive choice is named for what it is. */}
            <AlertDialog open={confirmingLogout} onOpenChange={setConfirmingLogout}>
                <AlertDialogContent className="sm:max-w-sm">
                    <AlertDialogTitle>{t('rail.menu.logoutGuest.title')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('rail.menu.logoutGuest.description')}</AlertDialogDescription>
                    <AlertDialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setConfirmingLogout(false);
                                navigate('/account');
                            }}
                        >
                            {t('rail.menu.logoutGuest.connect')}
                        </Button>
                        <AlertDialogAction
                            onClick={runLogout}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {t('rail.menu.logoutGuest.confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
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
