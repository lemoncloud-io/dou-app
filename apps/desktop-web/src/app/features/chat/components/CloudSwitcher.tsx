import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, ChevronDown, Pencil, RefreshCw, Trash2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { applyChannelOrder, useCloudOrder } from '@chatic/shared';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
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
    MobileAppPointer,
    cloudTiles,
    isLapsedCloud,
    type RailCloud,
    deleteCauseKey,
    useRemoveCloud,
    toastFailure,
} from '../../../shared';
import { RenameCloudDialog } from './RenameCloudDialog';

/**
 * Only the active, open cloud of yours can be renamed here: `cloud.update` goes out on the active
 * slot's socket, so renaming another cloud would send its id down this cloud's connection and
 * write its row into this cloud's cache. A lapsed cloud cannot be opened, let alone edited.
 */
const canRename = (cloud: RailCloud, activeCloudId: string | null): boolean =>
    cloud.kind === 'owned' && cloud.id === activeCloudId && !isLapsedCloud(cloud);

/** The word a cloud adds to its name when it cannot be opened as it is. */
const STATUS_KEY: Partial<Record<string, string>> = {
    error: 'cloud.status.error',
    reserved: 'cloud.status.provisioning',
    init: 'cloud.status.provisioning',
    suspended: 'cloud.status.suspended',
    expired: 'cloud.status.expired',
};

/**
 * Deleting an owned cloud releases it on the server, with everything in it. A cloud that cannot be opened
 * as it is (the states the row labels: still being set up, failed, suspended, expired) is one the user
 * cannot even enter to check what they would lose, so it is not offered for removal. An invited cloud
 * is only forgotten on this device, which is safe in any state.
 */
const canDelete = (cloud: RailCloud): boolean =>
    cloud.kind === 'invited' || (cloud.kind === 'owned' && !(cloud.status && STATUS_KEY[cloud.status]));

interface CloudSwitcherProps {
    clouds: RailCloud[];
    activeCloudId: string | null;
    hasUnread: boolean;
    /** Clouds with a pending cross-cloud push (socket only covers the active
     * cloud, so this is the only unread signal for the others). */
    badgedClouds?: Record<string, true>;
    onSelectCloud: (cloudId: string) => void;
    /** A cloud/place switch is in flight — lock the switcher to block a second switch
     * mid-handshake (the pipeline is serial). */
    isSwitching?: boolean;
    /** The cloud list could not be read. Owned clouds are missing from `clouds` (or the list is stale)
     * until a retry lands, and the menu says so. */
    isCatalogError?: boolean;
    isRetryingCatalog?: boolean;
    onRetryCatalog?: () => void;
}

/** A cloud's initial on its tile. Black with a lime initial when active, as the design draws it. */
const CloudInitial = ({
    initial,
    size,
    isActive,
    isInactive,
}: {
    initial: string;
    size: 'tile' | 'row';
    isActive: boolean;
    isInactive: boolean;
}) => (
    <span
        aria-hidden
        className={cn(
            'flex shrink-0 items-center justify-center font-bold',
            size === 'tile' ? 'h-12 w-12 rounded-[14px]' : 'h-7 w-7 rounded-lg text-caption',
            size === 'tile' && (Array.from(initial).length > 1 ? 'text-lead' : 'text-headline'),
            isActive ? 'bg-tile-active text-primary' : 'border border-hairline bg-background text-rail-foreground',
            // A cloud that cannot be opened reads as set aside, not faded out: a dashed edge and muted
            // ink at full opacity stay legible, where 50% opacity left the initial under text contrast.
            !isActive && isInactive && 'border-dashed border-muted-foreground text-muted-foreground'
        )}
    >
        {initial}
    </span>
);

/**
 * The top of the left rail: the active cloud's tile with a chevron under it. The menu it opens lists
 * every cloud (Home first, then the stored order) to switch to, and holds what the old cloud tiles'
 * right-click menus did — renaming the active cloud and removing a cloud — plus the retry when the
 * cloud list could not be read.
 */
export const CloudSwitcher = ({
    clouds,
    activeCloudId: sessionCloudId,
    hasUnread,
    badgedClouds,
    onSelectCloud,
    isSwitching,
    isCatalogError,
    isRetryingCatalog,
    onRetryCatalog,
}: CloudSwitcherProps) => {
    const { t } = useTranslation();
    // The session names no cloud while it sits on Home; HomePage reads that as Home, and the tile
    // has to agree or it shows no cloud at all.
    const activeCloudId = sessionCloudId ?? 'default';

    // Cloud removal: invited clouds are forgotten locally, owned clouds are
    // deleted on the backend — both gated behind a confirm dialog.
    const { removeInvitedCloud, deleteOwnedCloud, isDeleting } = useRemoveCloud();
    const [pendingRemove, setPendingRemove] = useState<RailCloud | null>(null);
    const isOwnedRemoval = pendingRemove?.kind === 'owned';
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
            const key = deleteCauseKey(error);
            setRemoveErrorKey(key);
            toastFailure(t(key), error);
            return;
        }
        // A cloud released before this delete is not an error to retry; the list has been refreshed.
        if (alreadyGone) toast({ description: t('cloud.delete.alreadyGone') });
        if (id === activeCloudId) onSelectCloud('default');
        closeRemoveDialog();
    };

    // An id reads as noise; a cloud without a real name is "Untitled", numbered when there are several
    // so no two rows read the same. Named from the list as the sources give it, so a cloud's number is
    // part of its cloud and does not change with the stored order.
    const tiles = cloudTiles(clouds, ordinal =>
        ordinal ? t('cloud.untitledNumbered', { number: ordinal }) : t('cloud.untitled')
    );
    const tileByCloud = new Map(clouds.map((cloud, index) => [cloud.id, tiles[index]]));
    const labelOf = (cloud: RailCloud) => {
        const { label } = tileByCloud.get(cloud.id) ?? { label: cloud.id };
        const statusKey = cloud.status ? STATUS_KEY[cloud.status] : undefined;
        return statusKey ? t('cloud.statusLabel', { name: label, status: t(statusKey) }) : label;
    };

    // The order the user arranged the clouds in, kept from the old rail. Home is the way back from
    // every cloud, so it is listed first whatever was stored.
    const { storedIds } = useCloudOrder();
    const home = clouds.find(cloud => cloud.kind === 'home');
    const movable = clouds.filter(cloud => cloud.kind !== 'home');
    const cloudById = new Map(movable.map(cloud => [cloud.id, cloud]));
    const ordered = [
        ...(home ? [home] : []),
        ...applyChannelOrder(
            movable.map(cloud => cloud.id),
            storedIds
        ).flatMap(id => cloudById.get(id) ?? []),
    ];

    const active = clouds.find(cloud => cloud.id === activeCloudId);
    const activeTile = active ? tileByCloud.get(active.id) : undefined;
    const activeName = activeTile?.label ?? t('cloud.empty');
    // Only the rows the menu lists: a push flag for a cloud with no row (one that was removed, or an
    // id the backend stamped that is not ours) can never be opened, so it would hold the dot forever.
    const anyUnread = hasUnread || ordered.some(cloud => cloud.id !== activeCloudId && !!badgedClouds?.[cloud.id]);
    const renamable = active && canRename(active, activeCloudId) ? active : null;
    const removable = ordered.filter(canDelete);

    const select = (cloud: RailCloud) => {
        if (!isLapsedCloud(cloud)) {
            if (cloud.id !== activeCloudId) onSelectCloud(cloud.id);
            return;
        }
        // Only a subscription reopens a lapsed cloud, and that is bought in the
        // mobile app, so the row and the click both say where to go.
        toast({ title: t('cloud.lapsed.title'), description: <MobileAppPointer /> });
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger
                    disabled={isSwitching}
                    aria-label={t(anyUnread ? 'cloud.switcher.unread' : 'cloud.switcher.open', { name: activeName })}
                    className={cn(
                        'group flex shrink-0 flex-col items-center gap-1 rounded-[14px] focus-ring',
                        isSwitching && 'cursor-not-allowed'
                    )}
                >
                    <span className="relative transition-transform duration-150 ease-tactile tactile">
                        <CloudInitial initial={activeTile?.initial ?? '?'} size="tile" isActive isInactive={false} />
                        {anyUnread && (
                            <span
                                aria-hidden
                                className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-rail bg-badge-unread"
                            />
                        )}
                    </span>
                    <ChevronDown
                        size={16}
                        aria-hidden
                        className="text-rail-foreground transition-transform duration-150 ease-tactile group-data-[state=open]:rotate-180"
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-64">
                    <DropdownMenuLabel className="text-overline uppercase text-muted-foreground">
                        {t('cloud.switcher.title')}
                    </DropdownMenuLabel>
                    {ordered.length === 0 && (
                        <p className="px-2 py-1.5 text-callout text-muted-foreground">{t('cloud.empty')}</p>
                    )}
                    {ordered.map(cloud => {
                        const tile = tileByCloud.get(cloud.id) ?? { label: cloud.id, initial: '?' };
                        const isActive = cloud.id === activeCloudId;
                        const isLapsed = isLapsedCloud(cloud);
                        const hasDot = (isActive && hasUnread) || (!isActive && !!badgedClouds?.[cloud.id]);
                        return (
                            <DropdownMenuItem
                                key={cloud.id}
                                aria-label={labelOf(cloud)}
                                aria-current={isActive ? 'true' : undefined}
                                onSelect={() => select(cloud)}
                                className="gap-2.5"
                            >
                                <CloudInitial
                                    initial={tile.initial}
                                    size="row"
                                    isActive={isActive}
                                    isInactive={!!cloud.status && cloud.status !== 'active'}
                                />
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-callout text-foreground">{labelOf(cloud)}</span>
                                    {isLapsed && (
                                        <span className="truncate text-caption text-muted-foreground">
                                            {t('mobileApp.planAndCloud')}
                                        </span>
                                    )}
                                </span>
                                {hasDot && (
                                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-badge-unread" />
                                )}
                                {isActive && <Check size={16} aria-hidden className="shrink-0 text-foreground" />}
                            </DropdownMenuItem>
                        );
                    })}
                    {isCatalogError && (
                        // Owned clouds that did not load would otherwise just be missing.
                        <DropdownMenuItem
                            disabled={isRetryingCatalog}
                            onSelect={event => {
                                // Stays open so the reloaded list lands where the reader is looking.
                                event.preventDefault();
                                onRetryCatalog?.();
                            }}
                            className="gap-2.5 text-muted-foreground"
                        >
                            <RefreshCw size={14} aria-hidden className={cn(isRetryingCatalog && 'animate-spin')} />
                            {t('cloud.loadFailed.retry')}
                        </DropdownMenuItem>
                    )}
                    {(renamable || removable.length > 0) && <DropdownMenuSeparator />}
                    {renamable && (
                        <DropdownMenuItem onSelect={() => setPendingRename(renamable)} className="gap-2.5">
                            <Pencil size={14} aria-hidden />
                            {t('cloud.rename.action')}
                        </DropdownMenuItem>
                    )}
                    {removable.length > 0 && (
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="gap-2.5 text-destructive focus:text-destructive">
                                <Trash2 size={14} aria-hidden />
                                {t('cloud.remove.action')}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-52">
                                {removable.map(cloud => (
                                    <DropdownMenuItem key={cloud.id} onSelect={() => setPendingRemove(cloud)}>
                                        {tileByCloud.get(cloud.id)?.label ?? cloud.id}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

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
        </>
    );
};
