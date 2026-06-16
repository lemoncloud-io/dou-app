import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

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

import { type RailCloud, useRemoveCloud } from '../../../shared';

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

const cloudInitial = (cloud: RailCloud): string =>
    (cloud.name ?? cloud.id ?? '?').trim().charAt(0).toUpperCase() || '#';

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

    return (
        <div className="flex h-full w-full flex-col items-center">
            {/* overflow-y:auto forces overflow-x to clip too, and items-center shrinks
                this to exactly the tile width — pad so the -right-1/-top-1 remove
                badge stays inside the clip box instead of getting sliced. */}
            <div className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto scrollbar-hide px-1.5 py-1.5">
                {clouds.length === 0 && (
                    <span className="px-1 text-center text-overline leading-tight text-rail-foreground">
                        {t('cloud.empty')}
                    </span>
                )}
                {clouds.map(cloud => {
                    const isActive = cloud.id === activeCloudId;
                    const isInactive = cloud.status && cloud.status !== 'active';
                    // Home/Default can't be removed; owned + invited clouds can.
                    const removable = cloud.kind !== 'home';
                    return (
                        <div key={cloud.id} className="group relative">
                            <button
                                onClick={() => onSelectCloud(cloud.id)}
                                disabled={isSwitching}
                                title={cloud.name ?? cloud.id}
                                aria-label={cloud.name ?? cloud.id}
                                aria-current={isActive ? 'true' : undefined}
                                className={cn(
                                    'relative flex h-11 w-11 items-center justify-center text-callout font-semibold transition-all duration-150 ease-tactile tactile',
                                    'rounded-2xl hover:rounded-xl focus-ring',
                                    // Slack-style selected workspace: brighter corners + a light
                                    // ring offset from the rail, instead of a faint left bar.
                                    isActive
                                        ? 'rounded-xl bg-primary text-primary-foreground shadow-raised ring-2 ring-rail-foreground/80 ring-offset-2 ring-offset-rail'
                                        : 'bg-rail-muted text-rail-foreground hover:bg-rail-muted/70',
                                    isInactive && 'opacity-50',
                                    // Block a second switch mid-handshake; dim non-active icons for feedback.
                                    isSwitching && 'cursor-not-allowed',
                                    isSwitching && !isActive && 'opacity-40'
                                )}
                            >
                                {cloudInitial(cloud)}
                                {/* Active tile: live socket unread. Other tiles: a pending
                                    cross-cloud push (the only unread signal available for them). */}
                                {((isActive && hasUnread) || (!isActive && !!badgedClouds?.[cloud.id])) && (
                                    <span
                                        aria-hidden
                                        className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-rail bg-badge-unread"
                                    />
                                )}
                            </button>
                            {removable && (
                                <button
                                    type="button"
                                    onClick={() => setPendingRemove(cloud)}
                                    disabled={isSwitching}
                                    aria-label={t('cloud.remove.action')}
                                    title={t('cloud.remove.action')}
                                    className="focus-ring absolute -right-1 -top-1 z-10 hidden h-4 w-4 items-center justify-center rounded-full border border-rail bg-destructive text-destructive-foreground shadow-raised transition-opacity group-hover:flex disabled:opacity-50"
                                >
                                    <X className="h-2.5 w-2.5" aria-hidden />
                                </button>
                            )}
                        </div>
                    );
                })}
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
