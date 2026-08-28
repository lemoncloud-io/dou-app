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
                        className="focus-ring tactile flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                    >
                        <MoreVertical size={18} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 shadow-overlay">
                    <DropdownMenuItem onClick={() => openSettings(channelId)} className="cursor-pointer py-2">
                        {t('chat.header.settings')}
                    </DropdownMenuItem>
                    {isOwner && (
                        <DropdownMenuItem onClick={() => openDialog('rename')} className="cursor-pointer py-2">
                            {t('channels.settings.rename')}
                        </DropdownMenuItem>
                    )}
                    {/* Invite is dev-only — hidden in production builds. */}
                    <DropdownMenuItem onClick={() => openDialog('add-members')} className="cursor-pointer py-2">
                        {t('channels.addMembers.open')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => openDialog('leave')} className="cursor-pointer py-2">
                        {t('channels.settings.leave')}
                    </DropdownMenuItem>
                    {isOwner && (
                        <DropdownMenuItem
                            onClick={() => openDialog('delete')}
                            className="cursor-pointer py-2 text-destructive focus:text-destructive"
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
