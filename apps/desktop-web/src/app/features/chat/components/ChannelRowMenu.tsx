import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, LogOut, MailPlus, Pencil, SlidersHorizontal, Star, Trash2, UserPlus } from 'lucide-react';

import { runtime, RELAY_CLOUD_ID, type DomainChannel } from '@chatic/runtime-react';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '@chatic/ui-kit';

import { type ChannelDialogKind, isChannelOwner, useChannelSettingsStore, useSendInviteStore } from '../../channels';
import { isDmBucket } from '../utils';
import {
    isRelayGuest,
    lastChatNoOf,
    useChannelNotifyChange,
    useReadCursorStore,
    type ChannelNotifyMode,
    toastFailure,
} from '../../../shared';

type RowDialogKind = Exclude<ChannelDialogKind, 'kick' | null>;

interface ChannelRowMenuProps {
    channel: DomainChannel;
    myUid: string | null;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    openDialog: (kind: RowDialogKind) => void;
    onMenuOpen: (channelId: string) => void;
    children: ReactNode;
}

export const ChannelRowMenu = ({
    channel,
    myUid,
    isFavorite,
    onToggleFavorite,
    openDialog,
    onMenuOpen,
    children,
}: ChannelRowMenuProps) => {
    const { t } = useTranslation();
    const id = channel.id ?? '';
    const isOwner = isChannelOwner(channel, myUid);
    const isDm = isDmBucket(channel);
    const unread = channel.unreadCount ?? 0;
    const lastChatNo = lastChatNoOf(channel);

    const openSettings = useChannelSettingsStore(s => s.open);
    const openSendInvite = useSendInviteStore(s => s.open);
    const canInvite = !isDm && !isRelayGuest();
    const { notifyMode, notifyModes, onNotifyChange } = useChannelNotifyChange(channel, myUid);

    const markRowRead = () => {
        if (lastChatNo <= 0) return;
        useReadCursorStore.getState().markRead(id, lastChatNo);
        runtime.data
            .getCloudRepositories(channel.cid || RELAY_CLOUD_ID)
            .join.readChat({ channelId: id, chatNo: lastChatNo })
            .then(receipt => receipt.delivered)
            .catch((error: unknown) => {
                toastFailure(t('sidebar.markReadFailed'), error);
            });
    };

    return (
        <ContextMenu onOpenChange={open => open && onMenuOpen(id)}>
            <ContextMenuTrigger asChild>
                <div className="contents">{children}</div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
                <ContextMenuItem onSelect={onToggleFavorite}>
                    <Star size={14} aria-hidden className={isFavorite ? 'fill-favorite text-favorite' : undefined} />
                    {t(isFavorite ? 'chat.header.unfavorite' : 'chat.header.favorite')}
                </ContextMenuItem>
                {unread > 0 && lastChatNo > 0 && (
                    <ContextMenuItem onSelect={markRowRead}>
                        <CheckCheck size={14} aria-hidden />
                        {t('sidebar.markRead')}
                    </ContextMenuItem>
                )}
                <ContextMenuSub>
                    <ContextMenuSubTrigger>
                        <Bell size={14} aria-hidden />
                        {`${t('sidebar.notifications')} · ${t(`channels.settings.notify.${notifyMode}`)}`}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent>
                        <ContextMenuRadioGroup
                            value={notifyMode}
                            onValueChange={value => onNotifyChange(value as ChannelNotifyMode)}
                        >
                            {notifyModes.map(mode => (
                                <ContextMenuRadioItem key={mode} value={mode}>
                                    {t(`channels.settings.notify.${mode}`)}
                                </ContextMenuRadioItem>
                            ))}
                        </ContextMenuRadioGroup>
                    </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuItem onSelect={() => openSettings(id)}>
                    <SlidersHorizontal size={14} aria-hidden />
                    {t('chat.header.settings')}
                </ContextMenuItem>
                {isOwner && !isDm && (
                    <ContextMenuItem onSelect={() => openDialog('rename')}>
                        <Pencil size={14} aria-hidden />
                        {t('channels.settings.rename')}
                    </ContextMenuItem>
                )}
                {!isDm && (
                    <ContextMenuItem onSelect={() => openDialog('add-members')}>
                        <UserPlus size={14} aria-hidden />
                        {t('channels.addMembers.open')}
                    </ContextMenuItem>
                )}
                {canInvite && (
                    <ContextMenuItem onSelect={() => openSendInvite(id, channel.name ?? id)}>
                        <MailPlus size={14} aria-hidden />
                        {t('invite.send.open')}
                    </ContextMenuItem>
                )}{' '}
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => openDialog('leave')}>
                    <LogOut size={14} aria-hidden />
                    {t('channels.settings.leave')}
                </ContextMenuItem>
                {isOwner && !isDm && (
                    <ContextMenuItem
                        onSelect={() => openDialog('delete')}
                        className="text-destructive focus:text-destructive"
                    >
                        <Trash2 size={14} aria-hidden />
                        {t('channels.settings.delete')}
                    </ContextMenuItem>
                )}
            </ContextMenuContent>
        </ContextMenu>
    );
};
