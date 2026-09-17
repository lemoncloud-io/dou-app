import { useTranslation } from 'react-i18next';

import { LogOut, MoreVertical, Pencil, Settings, Trash2, UserPlus } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { ChannelActionDialogs, isChannelOwner, useChannelSettingsStore, type useChannelActions } from '../../channels';
import { HEADER_ICON_BUTTON } from './headerStyles';

interface ChannelHeaderMenuProps {
    channel: DomainChannel;
    myUid: string | null;
    /** Owned by the chat pane, which also opens Add members from the channel intro. */
    actions: ReturnType<typeof useChannelActions>;
}

/**
 * Kebab menu in the ChatPane header. Icons match the message menu's, so the two
 * menus read as one vocabulary. Settings opens the right-side panel; the
 * other actions run inline via their own dialogs. Owner-only items (Rename,
 * Delete) are hidden for non-owners.
 */
export const ChannelHeaderMenu = ({ channel, myUid, actions }: ChannelHeaderMenuProps) => {
    const { t } = useTranslation();
    const openSettings = useChannelSettingsStore(s => s.open);

    const channelId = channel.id;
    const isOwner = isChannelOwner(channel, myUid);
    const { openDialog } = actions;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={t('chat.header.menu')} className={HEADER_ICON_BUTTON}>
                        <MoreVertical size={18} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 shadow-overlay">
                    <DropdownMenuItem onClick={() => openSettings(channelId)} className="cursor-pointer py-2">
                        <Settings size={14} aria-hidden />
                        {t('chat.header.settings')}
                    </DropdownMenuItem>
                    {isOwner && (
                        <DropdownMenuItem onClick={() => openDialog('rename')} className="cursor-pointer py-2">
                            <Pencil size={14} aria-hidden />
                            {t('channels.settings.rename')}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => openDialog('add-members')} className="cursor-pointer py-2">
                        <UserPlus size={14} aria-hidden />
                        {t('channels.addMembers.open')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => openDialog('leave')} className="cursor-pointer py-2">
                        <LogOut size={14} aria-hidden />
                        {t('channels.settings.leave')}
                    </DropdownMenuItem>
                    {isOwner && (
                        <DropdownMenuItem
                            onClick={() => openDialog('delete')}
                            className="cursor-pointer py-2 text-destructive focus:text-destructive"
                        >
                            <Trash2 size={14} aria-hidden />
                            {t('channels.settings.delete')}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <ChannelActionDialogs
                channelId={channelId}
                channelName={channel.name ?? ''}
                kickName=""
                actions={actions}
            />
        </>
    );
};
