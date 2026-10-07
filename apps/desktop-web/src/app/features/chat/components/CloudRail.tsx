import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Pencil, RefreshCw, Trash2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '@chatic/ui-kit/components/ui/context-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

import {
    Hint,
    MobileAppPointer,
    ScrollHint,
    cloudTiles,
    isLapsedCloud,
    useScrollOverflow,
    type RailCloud,
    deleteCauseKey,
    useRemoveCloud,
} from '../../../shared';
import { RenameCloudDialog } from './RenameCloudDialog';

/**
 * Only the active, open cloud of yours can be renamed here: `cloud.update` goes out on the active
 * slot's socket, so renaming another tile would send its id down this cloud's connection and
 * write its row into this cloud's cache. A lapsed cloud cannot be opened, let alone edited.
 */
const canRename = (cloud: RailCloud, activeCloudId: string | null): boolean =>
    cloud.kind === 'owned' && cloud.id === activeCloudId && !isLapsedCloud(cloud);

/** The word a tile adds to its name when its cloud cannot be opened as it is. */
const STATUS_KEY: Partial<Record<string, string>> = {
    error: 'cloud.status.error',
    reserved: 'cloud.status.provisioning',
    init: 'cloud.status.provisioning',
    suspended: 'cloud.status.suspended',
    expired: 'cloud.status.expired',
};

interface CloudRailProps {
    clouds: RailCloud[];
    activeCloudId: string | null;
    hasUnread: boolean;
    /** Clouds with a pending cross-cloud push (socket only covers the active
     * cloud, so this is the only unread signal for the other tiles). */
    badgedClouds?: Record<string, true>;
    onSelectCloud: (cloudId: string) => void;
    /** A cloud/place switch is in flight — disable the cloud buttons to block a
     * second switch mid-handshake (the pipeline is serial). */
    isSwitching?: boolean;
    /** The cloud list could not be read. Owned clouds are missing from `clouds` (or the list is stale)
     * until a retry lands, and the rail says so. */
    isCatalogError?: boolean;
    isRetryingCatalog?: boolean;
    onRetryCatalog?: () => void;
}

/**
 * Leftmost rail. Each icon is a cloud (a distinct server with its own
 * front/API URL); selecting one runs the cloud switch pipeline. The signed-in
 * user's menu is pinned to the bottom.
 */
export const CloudRail = ({
    clouds,
    activeCloudId,
    hasUnread,
    badgedClouds,
    onSelectCloud,
    isSwitching,
    isCatalogError,
    isRetryingCatalog,
    onRetryCatalog,
}: CloudRailProps) => {
    const { t } = useTranslation();

    // Cloud removal: invited clouds are forgotten locally, owned clouds are
    // deleted on the backend — both gated behind a confirm dialog.
    const { removeInvitedCloud, deleteOwnedCloud, isDeleting } = useRemoveCloud();
    const [pendingRemove, setPendingRemove] = useState<RailCloud | null>(null);
    const isOwnedRemoval = pendingRemove?.kind === 'owned';
    // Renaming is the owner's edit, so only owned tiles offer it.
    const [pendingRename, setPendingRename] = useState<RailCloud | null>(null);
    // Why the last delete was refused, as a translation key so a language change redraws it. The
    // dialog stays open for a retry, and says why.
    const [removeErrorKey, setRemoveErrorKey] = useState<string | null>(null);

    const closeRemoveDialog = () => {
        setPendingRemove(null);
        setRemoveErrorKey(null);
    };

    const confirmRemove = async () => {
        if (!pendingRemove) return;
        const { id, kind } = pendingRemove;
        setRemoveErrorKey(null);
        let alreadyGone = false;
        try {
            if (kind === 'owned') alreadyGone = (await deleteOwnedCloud(id)) === 'already-gone';
            else removeInvitedCloud(id);
        } catch (error) {
            setRemoveErrorKey(deleteCauseKey(error));
            return;
        }
        // A cloud released before this delete is not an error to retry; the list has been refreshed.
        if (alreadyGone) toast({ description: t('cloud.delete.alreadyGone') });
        if (id === activeCloudId) onSelectCloud('default');
        closeRemoveDialog();
    };

    const scroll = useScrollOverflow<HTMLDivElement>();
    // An id on a tile reads as noise; a cloud without a real name is "Untitled", numbered when
    // there are several so neither the tiles nor their labels read the same.
    const tiles = cloudTiles(clouds, ordinal =>
        ordinal ? t('cloud.untitledNumbered', { number: ordinal }) : t('cloud.untitled')
    );

    return (
        <div className="flex h-full w-full flex-col items-center">
            {/* overflow-y:auto forces overflow-x to clip too, and items-center shrinks
                this to exactly the tile width — pad so the -right-1/-top-1 remove
                badge stays inside the clip box instead of getting sliced. */}
            <div className="relative flex min-h-0 flex-1 flex-col">
                {scroll.above && <ScrollHint edge="top" surface="rail" />}
                <div
                    ref={scroll.ref}
                    className="flex flex-1 flex-col items-center gap-3 overflow-y-auto scrollbar-hide px-1.5 py-1.5"
                >
                    {clouds.length === 0 && (
                        <span className="px-1 text-center text-overline leading-tight text-rail-foreground">
                            {t('cloud.empty')}
                        </span>
                    )}
                    {clouds.map((cloud, index) => {
                        const { label, initial } = tiles[index];
                        const isActive = cloud.id === activeCloudId;
                        const isInactive = !!cloud.status && cloud.status !== 'active';
                        const isLapsed = isLapsedCloud(cloud);
                        // Home/Default can't be removed; owned + invited clouds can.
                        const removable = cloud.kind !== 'home';
                        // A cloud that cannot be opened as it is says why before the click fails.
                        const statusKey = cloud.status ? STATUS_KEY[cloud.status] : undefined;
                        const tileLabel = statusKey
                            ? t('cloud.statusLabel', { name: label, status: t(statusKey) })
                            : label;
                        // Only a subscription reopens a lapsed cloud, and that is bought in the
                        // mobile app, so the hint and the click both say where to go.
                        const hintLabel = isLapsed ? `${tileLabel}\n${t('mobileApp.planAndCloud')}` : tileLabel;
                        const select = () => {
                            if (!isLapsed) {
                                onSelectCloud(cloud.id);
                                return;
                            }
                            // A switch here was refused and offered a Try again that could never work.
                            toast({ title: t('cloud.lapsed.title'), description: <MobileAppPointer /> });
                        };
                        return (
                            <ContextMenu key={cloud.id}>
                                <ContextMenuTrigger asChild>
                                    {/* Plain wrapper, as on the channel rows: composing the Radix
                                    trigger onto Hint's own trigger drops onContextMenu. */}
                                    <div className="contents">
                                        <Hint label={hintLabel}>
                                            <button
                                                onClick={select}
                                                disabled={isSwitching}
                                                aria-label={tileLabel}
                                                aria-current={isActive ? 'true' : undefined}
                                                className={cn(
                                                    'relative flex h-12 w-12 items-center justify-center rounded-[14px] font-bold',
                                                    Array.from(initial).length > 1 ? 'text-lead' : 'text-headline',
                                                    'transition-colors duration-150 ease-tactile tactile focus-ring',
                                                    // Figma Icon Rail: the active cloud is a black tile with a
                                                    // lime ring and lime initial; the others sit quiet on the rail.
                                                    isActive
                                                        ? 'border-2 border-primary bg-tile-active text-primary'
                                                        : 'border border-hairline bg-background text-rail-foreground hover:border-primary/60',
                                                    // A cloud that cannot be opened reads as set aside, not
                                                    // faded out: a dashed edge and muted ink at full opacity
                                                    // stay legible, where 50% opacity left the initial at
                                                    // well under text contrast.
                                                    !isActive &&
                                                        isInactive &&
                                                        'border-dashed border-muted-foreground text-muted-foreground',
                                                    // Block a second switch mid-handshake; dim non-active icons for feedback.
                                                    isSwitching && 'cursor-not-allowed',
                                                    isSwitching && !isActive && 'opacity-40'
                                                )}
                                            >
                                                {initial}
                                                {/* Active tile: live socket unread. Other tiles: a pending
                                    cross-cloud push (the only unread signal available for them). */}
                                                {((isActive && hasUnread) ||
                                                    (!isActive && !!badgedClouds?.[cloud.id])) && (
                                                    <span
                                                        aria-hidden
                                                        className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-rail bg-badge-unread"
                                                    />
                                                )}
                                            </button>
                                        </Hint>
                                    </div>
                                </ContextMenuTrigger>
                                {/* Removing a workspace used to be a 16px badge in the tile's
                                top-right — the same corner that means unread, one mispress
                                from switching into the cloud it would remove. It lives in
                                the tile's own menu now, which the Menu key opens too. */}
                                {removable && (
                                    <ContextMenuContent className="w-52">
                                        {canRename(cloud, activeCloudId) && (
                                            <ContextMenuItem
                                                disabled={isSwitching}
                                                onSelect={() => setPendingRename(cloud)}
                                            >
                                                <Pencil size={14} aria-hidden />
                                                {t('cloud.rename.action')}
                                            </ContextMenuItem>
                                        )}
                                        <ContextMenuItem
                                            disabled={isSwitching}
                                            onSelect={() => setPendingRemove(cloud)}
                                            className="text-destructive focus:text-destructive"
                                        >
                                            <Trash2 size={14} aria-hidden />
                                            {t('cloud.remove.action')}
                                        </ContextMenuItem>
                                    </ContextMenuContent>
                                )}
                            </ContextMenu>
                        );
                    })}
                    {isCatalogError && (
                        // The same quiet tile as a cloud that cannot be opened, with the reload icon:
                        // owned clouds that did not load would otherwise just be missing.
                        <Hint label={t('cloud.loadFailed.hint')}>
                            <button
                                onClick={onRetryCatalog}
                                disabled={isRetryingCatalog}
                                aria-label={t('cloud.loadFailed.retry')}
                                className="flex h-12 w-12 flex-col items-center justify-center rounded-[14px] border border-dashed border-muted-foreground text-muted-foreground transition-colors duration-150 ease-tactile tactile focus-ring disabled:cursor-not-allowed"
                            >
                                <RefreshCw size={16} aria-hidden className={cn(isRetryingCatalog && 'animate-spin')} />
                            </button>
                        </Hint>
                    )}
                </div>
                {scroll.below && <ScrollHint edge="bottom" surface="rail" />}
            </div>

            <RenameCloudDialog
                open={!!pendingRename}
                onOpenChange={open => !open && setPendingRename(null)}
                cloudId={pendingRename?.id ?? ''}
                currentName={pendingRename?.name ?? ''}
            />

            <AlertDialog open={!!pendingRemove} onOpenChange={open => !open && !isDeleting && closeRemoveDialog()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t(isOwnedRemoval ? 'cloud.delete.title' : 'cloud.remove.title')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(isOwnedRemoval ? 'cloud.delete.description' : 'cloud.remove.description')}
                        </AlertDialogDescription>
                        {removeErrorKey && (
                            <p role="alert" className="text-callout text-destructive">
                                {t(removeErrorKey)}
                            </p>
                        )}
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>{t('cloud.delete.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isDeleting}
                            onClick={e => {
                                e.preventDefault();
                                void confirmRemove();
                            }}
                            className={cn(
                                isOwnedRemoval && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                            )}
                        >
                            {isOwnedRemoval
                                ? isDeleting
                                    ? t('cloud.delete.deleting')
                                    : t('cloud.delete.confirm')
                                : t('cloud.remove.confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
