import { createElement, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ToastAction, type ToastActionElement } from '@chatic/ui-kit/components/ui/toast';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useComposerFocusStore, useDesktopChannelMutations, toastFailure } from '../../../shared';
import { channelActionErrorKey } from '../utils';

export type ChannelDialogKind = 'rename' | 'add-members' | 'delete' | 'leave' | 'kick' | null;

interface UseChannelActionsOptions {
    onRemoved?: () => void;
    resolveMemberName?: (userId: string) => string;
}

export const useChannelActions = (
    channelId: string | null,
    { onRemoved, resolveMemberName }: UseChannelActionsOptions = {}
) => {
    const { t } = useTranslation();
    const { deleteChannel, leaveChannel, inviteChannel, isMutating } = useDesktopChannelMutations();
    const requestComposerFocus = useComposerFocusStore(s => s.request);

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
            requestComposerFocus(channelId);
            onRemoved?.();
            toast({ description: t('toast.channelDeleted') });
        } catch (e) {
            closeDialog();
            toastFailure(t(channelActionErrorKey(e)), e);
        }
    }, [channelId, deleteChannel, closeDialog, requestComposerFocus, onRemoved, t]);

    const onLeave = useCallback(async () => {
        if (!channelId) return;
        try {
            await leaveChannel({ channelId });
            closeDialog();
            requestComposerFocus(channelId);
            onRemoved?.();
            toast({ description: t('toast.channelLeft') });
        } catch (e) {
            closeDialog();
            toastFailure(t(channelActionErrorKey(e)), e);
        }
    }, [channelId, leaveChannel, closeDialog, requestComposerFocus, onRemoved, t]);

    const onKick = useCallback(async () => {
        if (!channelId || !kickTarget) return;
        try {
            await leaveChannel({ channelId, userId: kickTarget });
            const removedId = kickTarget;
            const undo = () =>
                void inviteChannel({ channelId, userIds: [removedId] }).catch(e =>
                    toastFailure(t(channelActionErrorKey(e)), e)
                );
            toast({
                description: t('toast.memberRemoved', { name: resolveMemberName?.(removedId) ?? '' }),
                action: createElement(
                    ToastAction,
                    { altText: t('toast.undoRemove'), onClick: undo },
                    t('toast.undo')
                ) as unknown as ToastActionElement,
            });
        } catch (e) {
            toastFailure(t(channelActionErrorKey(e)), e);
        } finally {
            closeDialog();
        }
    }, [channelId, kickTarget, resolveMemberName, leaveChannel, inviteChannel, closeDialog, t]);

    return { dialog, kickTarget, openDialog, openKick, closeDialog, onDelete, onLeave, onKick, isMutating };
};
