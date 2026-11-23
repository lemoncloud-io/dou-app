import { useTranslation } from 'react-i18next';

import type { useChannelActions } from '../hooks';
import { AddMembersDialog } from './AddMembersDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { RenameChannelDialog } from './RenameChannelDialog';

type ChannelActions = ReturnType<typeof useChannelActions>;

interface ChannelActionDialogsProps {
    channelId: string;
    channelName: string;
    kickName: string;
    actions: ChannelActions;
}

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
            {dialog === 'add-members' && <AddMembersDialog open onOpenChange={onOpenChange} channelId={channelId} />}
            <ConfirmDialog
                open={dialog === 'delete'}
                onOpenChange={onOpenChange}
                title={t('channels.delete.title', { name: channelName })}
                description={t('channels.delete.description')}
                confirmLabel={t('channels.delete.confirm')}
                onConfirm={onDelete}
                isPending={isMutating}
            />
            <ConfirmDialog
                open={dialog === 'leave'}
                onOpenChange={onOpenChange}
                variant="default"
                title={t('channels.leave.title', { name: channelName })}
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
