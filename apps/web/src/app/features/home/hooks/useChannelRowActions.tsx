import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { runtime, type DomainChannel, type DomainJoin } from '@chatic/runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { ConfirmDialog } from '../../channels/components/ConfirmDialog';
import { useChannelMutations, useJoinMutations } from '../../channels/hooks';

type Removal = 'leave' | 'delete';

interface PendingRemoval {
    channel: DomainChannel;
    action: Removal;
}

export interface ChannelRowActions {
    setMuted: (channel: DomainChannel, join: DomainJoin | undefined, muted: boolean) => void;
    requestRemoval: (channel: DomainChannel, action: Removal) => void;
    dialog: ReactNode;
}

export const useChannelRowActions = (): ChannelRowActions => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { userId } = runtime.session.useSessionIdentity();
    const { updateJoin } = useJoinMutations();
    const { leaveChannel, deleteChannel, isPending } = useChannelMutations();
    const [pending, setPending] = useState<PendingRemoval | null>(null);
    const [open, setOpen] = useState(false);

    const setMuted = useCallback(
        (channel: DomainChannel, join: DomainJoin | undefined, muted: boolean) => {
            updateJoin({
                channelId: channel.id,
                userId: join?.userId ?? userId,
                notify: muted ? 'none' : 'all',
            } as never)
                .then(receipt => receipt.delivered)
                .catch(error => {
                    logger.error('CHAT', 'Failed to update room notification', {
                        error,
                        data: { channelId: channel.id },
                    });
                    toast({ title: t('chat.settings.notifyFailed'), variant: 'destructive' });
                });
        },
        [t, toast, updateJoin, userId]
    );

    const requestRemoval = useCallback((channel: DomainChannel, action: Removal) => {
        setPending({ channel, action });
        setOpen(true);
    }, []);

    const confirm = async () => {
        if (!pending || !open) return;
        const { channel, action } = pending;
        try {
            if (action === 'delete') await deleteChannel({ channelId: channel.id });
            else await leaveChannel({ channelId: channel.id });
            toast({ title: t(action === 'delete' ? 'chat.settings.deletedRoom' : 'chat.settings.leftRoomToast') });
        } catch (error) {
            logger.error('CHAT', action === 'delete' ? 'Failed to delete room' : 'Failed to leave room', {
                error,
                data: { channelId: channel.id, from: 'home-swipe' },
            });
            toast({
                title: t(action === 'delete' ? 'chat.settings.deleteFailed' : 'chat.settings.leaveFailed'),
                variant: 'destructive',
            });
        } finally {
            setOpen(false);
        }
    };

    const isDm = pending?.channel.stereo === 'dm';
    const copyKey =
        pending?.action === 'delete'
            ? 'chat.settings.deleteDialog'
            : isDm
              ? 'chat.settings.dmLeaveDialog'
              : 'chat.settings.leaveDialog';

    const dialog = (
        <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title={t(`${copyKey}.title`)}
            description={t(`${copyKey}.description`)}
            confirmLabel={t(`${copyKey}.confirm`)}
            onConfirm={confirm}
            isPending={pending?.action === 'delete' ? isPending.delete : isPending.leave}
            variant={pending?.action === 'delete' ? 'danger' : 'warning'}
            closeOnConfirm={false}
        />
    );

    return { setMuted, requestRemoval, dialog };
};
