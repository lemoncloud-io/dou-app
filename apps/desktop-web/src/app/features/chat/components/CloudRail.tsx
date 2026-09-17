import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Trash2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

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

import { Hint, ScrollHint, distinctInitials, useScrollOverflow, type RailCloud, useRemoveCloud } from '../../../shared';

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
}

/**
 * Leftmost workspace rail. Each icon is a cloud (a distinct server with its own
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
}: CloudRailProps) => {
    const { t } = useTranslation();

    // Cloud removal: invited clouds are forgotten locally, owned clouds are
    // deleted on the backend — both gated behind a confirm dialog.
    const { removeInvitedCloud, deleteOwnedCloud, isDeleting } = useRemoveCloud();
    const [pendingRemove, setPendingRemove] = useState<RailCloud | null>(null);
    const isOwnedRemoval = pendingRemove?.kind === 'owned';

    const confirmRemove = async () => {
        if (!pendingRemove) return;
        const { id, kind } = pendingRemove;
        try {
            if (kind === 'owned') await deleteOwnedCloud(id);
            else removeInvitedCloud(id);
        } catch {
            return; // keep the dialog open so the user can retry
        }
        if (id === activeCloudId) onSelectCloud('default');
        setPendingRemove(null);
    };

    const scroll = useScrollOverflow<HTMLDivElement>();
    const initials = distinctInitials(clouds.map(cloud => cloud.name ?? cloud.id ?? ''));

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
                        const initial = initials[index] ?? '#';
                        const isActive = cloud.id === activeCloudId;
                        const isInactive = cloud.status && cloud.status !== 'active';
                        // Home/Default can't be removed; owned + invited clouds can.
                        const removable = cloud.kind !== 'home';
                        return (
                            <ContextMenu key={cloud.id}>
                                <ContextMenuTrigger asChild>
                                    {/* Plain wrapper, as on the channel rows: composing the Radix
                                    trigger onto Hint's own trigger drops onContextMenu. */}
                                    <div className="contents">
                                        <Hint label={cloud.name ?? cloud.id}>
                                            <button
                                                onClick={() => onSelectCloud(cloud.id)}
                                                disabled={isSwitching}
                                                aria-label={cloud.name ?? cloud.id}
                                                aria-current={isActive ? 'true' : undefined}
                                                className={cn(
                                                    'relative flex h-12 w-12 items-center justify-center rounded-[14px] font-bold',
                                                    Array.from(initial).length > 1 ? 'text-[16px]' : 'text-[20px]',
                                                    'transition-colors duration-150 ease-tactile tactile focus-ring',
                                                    // Figma Icon Rail: the active cloud is a black tile with a
                                                    // lime ring and lime initial; the others sit quiet on the rail.
                                                    isActive
                                                        ? 'border-2 border-primary bg-black text-primary'
                                                        : 'border border-hairline bg-background text-rail-foreground hover:border-primary/60',
                                                    isInactive && 'opacity-50',
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
                </div>
                {scroll.below && <ScrollHint edge="bottom" surface="rail" />}
            </div>

            <AlertDialog open={!!pendingRemove} onOpenChange={open => !open && !isDeleting && setPendingRemove(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t(isOwnedRemoval ? 'cloud.delete.title' : 'cloud.remove.title')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(isOwnedRemoval ? 'cloud.delete.description' : 'cloud.remove.description')}
                        </AlertDialogDescription>
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
