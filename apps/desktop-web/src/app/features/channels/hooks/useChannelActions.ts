import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useDesktopChannelMutations } from '../../../shared';
import { channelActionErrorKey } from '../utils';

export type ChannelDialogKind = 'rename' | 'add-members' | 'delete' | 'leave' | 'kick' | null;

interface UseChannelActionsOptions {
    /** Called after a successful delete or self-leave (e.g. clear selection). */
    onRemoved?: () => void;
    /**
     * Resolve a member id to a display name, for the removal toast. A resolver
     * rather than a name because the kick target is this hook's own state.
     */
    resolveMemberName?: (userId: string) => string;
}

/**
 * Owns every channel action + its dialog state for the desktop UI: the open
 * dialog kind, the pending kick target, the delete/leave/kick mutations (via
 * useDesktopChannelMutations) and their teardown. Both ChannelHeaderMenu and
 * ChannelSettingsPanel consume this so the wiring lives in exactly one place.
 */
export const useChannelActions = (
    channelId: string | null,
    { onRemoved, resolveMemberName }: UseChannelActionsOptions = {}
) => {
    const { t } = useTranslation();
    const { deleteChannel, leaveChannel, isMutating } = useDesktopChannelMutations();

    const [dialog, setDialog] = useState<ChannelDialogKind>(null);
    const [kickTarget, setKickTarget] = useState<string | null>(null);

    const openDialog = useCallback((kind: Exclude<ChannelDialogKind, 'kick' | null>) => setDialog(kind), []);

    const openKick = useCallback((userId: string) => {
        setKickTarget(userId);
        setDialog('kick');
    }, []);

    const closeDialog = useCallback(() => {
        setDialog(null);
        setKickTarget(null);
    }, []);

    const onDelete = useCallback(async () => {
        if (!channelId) return;
        try {
            await deleteChannel({ channelId });
            closeDialog();
            onRemoved?.();
            toast({ description: t('toast.channelDeleted') });
        } catch (e) {
            closeDialog();
            toast({ variant: 'destructive', description: t(channelActionErrorKey(e)) });
        }
    }, [channelId, deleteChannel, closeDialog, onRemoved, t]);

    const onLeave = useCallback(async () => {
        if (!channelId) return;
        try {
            await leaveChannel({ channelId });
            closeDialog();
            onRemoved?.();
            toast({ description: t('toast.channelLeft') });
        } catch (e) {
            closeDialog();
            toast({ variant: 'destructive', description: t(channelActionErrorKey(e)) });
        }
    }, [channelId, leaveChannel, closeDialog, onRemoved, t]);

    const onKick = useCallback(async () => {
        if (!channelId || !kickTarget) return;
        try {
            await leaveChannel({ channelId, userId: kickTarget });
            // Removing someone is invisible from the roster alone if the list has
            // not caught up yet, so say it happened — delete and leave both do.
            toast({ description: t('toast.memberRemoved', { name: resolveMemberName?.(kickTarget) ?? '' }) });
        } catch (e) {
            toast({ variant: 'destructive', description: t(channelActionErrorKey(e)) });
        } finally {
            closeDialog();
        }
    }, [channelId, kickTarget, resolveMemberName, leaveChannel, closeDialog, t]);

    return { dialog, kickTarget, openDialog, openKick, closeDialog, onDelete, onLeave, onKick, isMutating };
};
