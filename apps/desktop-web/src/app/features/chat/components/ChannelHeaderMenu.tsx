import { useTranslation } from 'react-i18next';

import { MoreVertical } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { ChannelActionDialogs, isChannelOwner, useChannelActions, useChannelSettingsStore } from '../../channels';
import { useSelectedChannelStore } from '../../../shared';

interface ChannelHeaderMenuProps {
    channel: DomainChannel;
    myUid: string | null;
}

/**
 * Kebab menu in the ChatPane header. Settings opens the right-side panel; the
 * other actions run inline via their own dialogs. Owner-only items (Rename,
 * Delete) are hidden for non-owners.
 */
export const ChannelHeaderMenu = ({ channel, myUid }: ChannelHeaderMenuProps) => {
    const { t } = useTranslation();
    const openSettings = useChannelSettingsStore(s => s.open);
    const clearChannel = useSelectedChannelStore(s => s.clearChannel);

    const channelId = channel.id;
    const isOwner = isChannelOwner(channel, myUid);

    const actions = useChannelActions(channelId, { onRemoved: clearChannel });
    const { openDialog } = actions;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={t('chat.header.menu')}
                        className="rounded p-1 text-muted-foreground hover:bg-accent"
                    >
                        <MoreVertical size={18} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => openSettings(channelId)} className="cursor-pointer">
                        {t('chat.header.settings')}
                    </DropdownMenuItem>
                    {isOwner && (
                        <DropdownMenuItem onClick={() => openDialog('rename')} className="cursor-pointer">
                            {t('channels.settings.rename')}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => openDialog('invite')} className="cursor-pointer">
                        {t('channels.settings.invite')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => openDialog('leave')} className="cursor-pointer">
                        {t('channels.settings.leave')}
                    </DropdownMenuItem>
                    {isOwner && (
                        <DropdownMenuItem
                            onClick={() => openDialog('delete')}
                            className="cursor-pointer text-destructive focus:text-destructive"
                        >
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
