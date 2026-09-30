import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import type { DomainChannel, DomainJoin } from '@chatic/data';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { ConfirmDialog } from '../../channels/components/ConfirmDialog';
import { useChannelMutations, useJoinMutations } from '../../channels/hooks';

type Removal = 'leave' | 'delete';

interface PendingRemoval {
    channel: DomainChannel;
    action: Removal;
}

export interface ChannelRowActions {
    /** Turns the room's notifications off (`muted`) or back on, through my join row. */
    setMuted: (channel: DomainChannel, join: DomainJoin | undefined, muted: boolean) => void;
    /** Asks for confirmation, then leaves or deletes. What to ask for is the caller's `removalActionFor`. */
    requestRemoval: (channel: DomainChannel, action: Removal) => void;
    /** The confirmation. Render it once, next to the rows. */
    dialog: ReactNode;
}

/**
 * The home row's swipe actions, done the way the room's own settings screen does them — the same
 * join write for notifications and the same confirmations, copy and repository calls for leaving and
 * deleting — so a room is not removed or muted one way from home and another way from inside it.
 *
 * Every write here is optimistic in the repository: the row loses its bell, or disappears, before
 * the server answers, and comes back if it refuses. So success needs no toast for a mute (the glyph
 * is the answer), and a removal's toast says only what happened.
 */
export const useChannelRowActions = (): ChannelRowActions => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { userId } = runtime.session.useSessionIdentity();
    const { updateJoin } = useJoinMutations();
    const { leaveChannel, deleteChannel, isPending } = useChannelMutations();
    // What the confirmation is about, kept after it closes: the dialog fades out over a few hundred
    // milliseconds, and clearing this with `open` would swap its copy to the default mid-fade.
    const [pending, setPending] = useState<PendingRemoval | null>(null);
    const [open, setOpen] = useState(false);

    const setMuted = useCallback(
        (channel: DomainChannel, join: DomainJoin | undefined, muted: boolean) => {
            // The join input types only channelId/notify; the engine resolves the row from
            // channelId + userId at write time — the same cast the settings screen makes.
            updateJoin({
                channelId: channel.id,
                userId: join?.userId ?? userId,
                notify: muted ? 'none' : 'all',
            } as never).catch(error => {
                logger.error('CHAT', 'Failed to update room notification', { error, data: { channelId: channel.id } });
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
            toast({ title: t(action === 'delete' ? 'chat.settings.deletedRoom' : 'chat.settings.leftRoom') });
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
            // The dialog stays up, spinning, until the call settles; `confirm` closes it.
            closeOnConfirm={false}
        />
    );

    return { setMuted, requestRemoval, dialog };
};
