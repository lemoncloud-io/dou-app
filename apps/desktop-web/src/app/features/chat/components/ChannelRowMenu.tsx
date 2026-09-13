import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, LogOut, Pencil, SlidersHorizontal, Star, Trash2, UserPlus } from 'lucide-react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';
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
} from '@chatic/ui-kit/components/ui/context-menu';

import { type ChannelDialogKind, isChannelOwner, useChannelSettingsStore } from '../../channels';
import { isDmBucket } from '../utils';
import {
    channelNotifyMode,
    lastChatNoOf,
    useDesktopChannelMutations,
    useNotificationPrefsStore,
    useReadCursorStore,
    type ChannelNotifyMode,
} from '../../../shared';

const NOTIFY_MODES: ChannelNotifyMode[] = ['all', 'mention', 'none'];

type RowDialogKind = Exclude<ChannelDialogKind, 'kick' | null>;

interface ChannelRowMenuProps {
    channel: DomainChannel;
    myUid: string | null;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    /** Opens the sidebar's ONE dialog stack (ChannelList owns the actions instance). */
    openDialog: (kind: RowDialogKind) => void;
    /** Tells the sidebar which row was right-clicked, before any item can run. */
    onMenuOpen: (channelId: string) => void;
    /** The row node the menu is attached to (right-click target). */
    children: ReactNode;
}

/**
 * Right-click menu on a sidebar row. Same actions as the ChatPane kebab menu,
 * but targeting any row: dialogs are NOT owned here — they render once in
 * ChannelList, keyed to the last menu target. Owner-only items (Rename,
 * Delete) and DM-inapplicable items (rename / members / delete) hide.
 */
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
    const { join: joinRepository } = runtime.data.useRuntimeRepositories();
    const { setChannelNotify: syncNotifyToServer } = useDesktopChannelMutations();
    // Same resolution as ChannelSettingsPanel — now one helper (channelNotifyMode).
    const notifyMode = useNotificationPrefsStore(s => channelNotifyMode(s, id, channel.$join?.notify));
    const setNotifyPref = useNotificationPrefsStore(s => s.setChannelNotify);

    // Same write as the read-receipt flush: optimistic local cursor first, the
    // server read-chat best-effort behind it.
    const markRowRead = () => {
        if (lastChatNo <= 0) return;
        useReadCursorStore.getState().markRead(id, lastChatNo);
        void joinRepository.readChat({ channelId: id, chatNo: lastChatNo }).catch(() => undefined);
    };

    // Local pref stands even if the server sync fails (see ChannelSettingsPanel).
    const onNotifyChange = (mode: ChannelNotifyMode) => {
        if (mode === notifyMode) return;
        setNotifyPref(id, mode);
        const joinUserId = channel.$join?.userId ?? myUid ?? '';
        if (joinUserId) {
            void syncNotifyToServer({ channelId: id, userId: joinUserId, notify: mode }).catch(() => undefined);
        }
    };

    return (
        <ContextMenu onOpenChange={open => open && onMenuOpen(id)}>
            <ContextMenuTrigger asChild>
                {/* Plain wrapper between the trigger and the row. Hint documents
                    trigger-prop forwarding, but composing the Radix CM trigger
                    asChild onto the row's Hint was observed to drop onContextMenu
                    (slice 05 spike) while this plain element provably works.
                    `display: contents` keeps it out of the row layout. Revisit
                    with a browser check before dropping the wrapper. */}
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
                        {t('sidebar.notifications')}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent>
                        <ContextMenuRadioGroup value={notifyMode} onValueChange={onNotifyChange}>
                            {NOTIFY_MODES.map(mode => (
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
