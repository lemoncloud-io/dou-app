import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Home, MailPlus, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';

import type { DomainPlace } from '@chatic/runtime-react';
import { cn, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, toast } from '@chatic/ui-kit';
import { usePlaceOrder } from '@chatic/shared';
import { Hint, ScrollHint, useScrollOverflow } from '@chatic/design-system-components-desktop';

import { ConfirmDialog, useSendInviteStore } from '../../channels';
import {
    isAtPlaceLimit,
    isManagedPlace,
    orderedRailPlaces,
    PLACE_MAX,
    placeFailure,
    type PlaceFailure,
} from '../utils';

import { MobileAppPointer, useDebugModeStore, toastFailure } from '../../../shared';
import { SortableList } from './SortableList';

interface PlaceRailProps {
    places: DomainPlace[];
    selectedPlaceId: string | null;
    unreadByPlace: Record<string, number>;
    isDefaultMode: boolean;
    isSwitching?: boolean;
    onSelectPlace: (placeId: string) => void;
    canManagePlaces?: boolean;
    onCreatePlace?: () => void;
    onEditPlace?: (placeId: string) => void;
    onDeletePlace?: (placeId: string) => Promise<void>;
}

const DELETE_FAILURE_KEY: Record<PlaceFailure, string> = {
    denied: 'place.delete.failed.denied',
    network: 'errors.network',
    other: 'place.delete.failed',
};

const tileInitial = (name: string): string => name.trim().charAt(0).toUpperCase() || '#';

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
    glyph?: ReactNode;
    isActive: boolean;
    unread: number;
    unreadLabel?: string;
    isSwitching?: boolean;
    onSelect: (placeId: string) => void;
    menu?: ReactNode;
}

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
    const ringed = isActive && !!thumbnail;
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
                            Array.from(tileInitial(name)).length > 1 ? 'text-lead' : 'text-headline',
                            isActive ? 'bg-primary text-primary-foreground' : 'bg-transparent group-hover:bg-border',
                            ringed && 'ring-2 ring-primary ring-offset-2 ring-offset-rail'
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
                    {unread > 0 && (
                        <span
                            className={cn(
                                'pointer-events-none absolute h-3 w-3 rounded-full border-2 border-rail bg-badge-unread',
                                ringed ? '-right-1.5 -top-1.5' : '-right-0.5 -top-0.5'
                            )}
                        />
                    )}
                </span>
                <span className={cn('max-w-full truncate text-callout font-medium leading-tight text-rail-foreground')}>
                    {name}
                </span>
            </button>
        </Hint>
    );
    if (!menu) return tile;
    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div className="contents">{tile}</div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">{menu}</ContextMenuContent>
        </ContextMenu>
    );
};

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

    const [deleteTarget, setDeleteTarget] = useState<DomainPlace | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const deleting = useRef(false);

    const deleteTargetListed = !!deleteTarget && places.some(place => place.id === deleteTarget.id);
    useEffect(() => {
        if (confirmingDelete && !deleteTargetListed && !deleting.current) setConfirmingDelete(false);
    }, [confirmingDelete, deleteTargetListed]);

    const askToDelete = (place: DomainPlace) => {
        setDeleteTarget(place);
        setConfirmingDelete(true);
    };

    const runDelete = async () => {
        if (!deleteTarget || !deleteTargetListed || !onDeletePlace || deleting.current || isSwitching) return;
        deleting.current = true;
        setIsDeleting(true);
        try {
            await onDeletePlace(deleteTarget.id);
            toast({ title: t('toast.placeDeleted') });
        } catch (error) {
            toastFailure(t(DELETE_FAILURE_KEY[placeFailure(error, 'DeletePlace')]), error);
        } finally {
            deleting.current = false;
            setIsDeleting(false);
            setConfirmingDelete(false);
        }
    };

    const toggleDebug = useDebugModeStore(s => s.toggle);
    const tapRef = useRef({ count: 0, last: 0 });
    const placeScroll = useScrollOverflow<HTMLDivElement>();

    const { storedIds, set: setStoredOrder } = usePlaceOrder(places[0]?.cid ?? null);
    const ordered = orderedRailPlaces(places, storedIds);

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
            <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={onSecretTap}
                className="flex w-full shrink-0 cursor-default justify-center py-5"
            >
                <span className="h-px w-8 bg-hairline" />
            </button>
            <div className="relative flex min-h-0 w-full flex-1 flex-col">
                {placeScroll.above && <ScrollHint edge="top" surface="rail" />}
                <div
                    ref={placeScroll.ref}
                    className="-mt-2 flex w-full flex-1 flex-col items-stretch gap-4 overflow-y-auto scrollbar-hide px-1 pt-2"
                >
                    {isDefaultMode ? (
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
                                    disabled={isSwitching}
                                    className="flex flex-col items-stretch gap-4"
                                    onReorder={setStoredOrder}
                                />
                            )}
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
                {placeScroll.below && <ScrollHint edge="bottom" surface="rail" />}
            </div>

            <ConfirmDialog
                open={confirmingDelete}
                onOpenChange={open => !open && !deleting.current && setConfirmingDelete(false)}
                title={t('place.delete.title', { name: deleteTarget?.name ?? '' })}
                description={t('place.delete.description')}
                confirmLabel={t('place.delete.confirm')}
                onConfirm={() => void runDelete()}
                isPending={isDeleting || !!isSwitching}
            />
        </div>
    );
};
