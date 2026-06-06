import { useTranslation } from 'react-i18next';

import type { useChannelActions } from '../hooks';
import { ConfirmDialog } from './ConfirmDialog';
import { InviteDialog } from './InviteDialog';
import { RenameChannelDialog } from './RenameChannelDialog';

type ChannelActions = ReturnType<typeof useChannelActions>;

interface ChannelActionDialogsProps {
    channelId: string;
    /** Current channel name, for the rename dialog's initial value. */
    channelName: string;
    /** Display name of the kick target, for the kick confirmation copy. */
    kickName: string;
    actions: ChannelActions;
}

/**
 * Renders every dialog driven by useChannelActions (rename, invite, and the
 * delete/leave/kick confirmations). Single mount point shared by the header
 * menu and the settings panel.
 */
export const ChannelActionDialogs = ({ channelId, channelName, kickName, actions }: ChannelActionDialogsProps) => {
    const { t } = useTranslation();
    const { dialog, closeDialog, onDelete, onLeave, onKick, isMutating } = actions;

    const onOpenChange = (next: boolean) => !next && closeDialog();

    return (
        <>
            <RenameChannelDialog
                open={dialog === 'rename'}
                onOpenChange={onOpenChange}
                channelId={channelId}
                currentName={channelName}
            />
            <InviteDialog open={dialog === 'invite'} onOpenChange={onOpenChange} channelId={channelId} />
            <ConfirmDialog
                open={dialog === 'delete'}
                onOpenChange={onOpenChange}
                title={t('channels.delete.title')}
                description={t('channels.delete.description')}
                confirmLabel={t('channels.delete.confirm')}
                onConfirm={onDelete}
                isPending={isMutating}
            />
            <ConfirmDialog
                open={dialog === 'leave'}
                onOpenChange={onOpenChange}
                title={t('channels.leave.title')}
                description={t('channels.leave.description')}
                confirmLabel={t('channels.leave.confirm')}
                onConfirm={onLeave}
                isPending={isMutating}
            />
            <ConfirmDialog
                open={dialog === 'kick'}
                onOpenChange={onOpenChange}
                title={t('channels.kick.title')}
                description={t('channels.kick.description', { name: kickName })}
                confirmLabel={t('channels.kick.confirm')}
                onConfirm={onKick}
                isPending={isMutating}
            />
        </>
    );
};
