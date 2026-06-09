import { useTranslation } from 'react-i18next';

import { MoreHorizontal } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import type { ChannelMember } from '../hooks';
import { UserProfilePopover, avatarStyle, displayName } from '../../../shared';

interface MemberRowProps {
    member: ChannelMember;
    isMe: boolean;
    /** Whether the current user can remove (kick) other members. */
    canKick: boolean;
    onKick: (userId: string) => void;
}

export const MemberRow = ({ member, isMe, canKick, onKick }: MemberRowProps) => {
    const { t } = useTranslation();
    const name = displayName(member);
    const initial = name.charAt(0).toUpperCase() || '?';
    const showKebab = canKick && !isMe;

    return (
        <div className="group flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent">
            <UserProfilePopover userId={member.id} fallbackName={name} isOwner={member.isOwner}>
                <button
                    type="button"
                    className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md text-left"
                >
                    <Avatar className="size-8 shrink-0">
                        {member.thumbnail && <AvatarImage src={member.thumbnail} alt={name} />}
                        <AvatarFallback className="text-xs font-semibold" style={avatarStyle(member.id || name)}>
                            {initial}
                        </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate text-callout text-foreground">{name}</span>
                </button>
            </UserProfilePopover>
            {member.isOwner && (
                <span className="rounded bg-badge-member/15 px-1.5 py-0.5 text-overline text-badge-member">
                    {t('channels.members.owner')}
                </span>
            )}
            {isMe && (
                <span className="rounded bg-accent px-1.5 py-0.5 text-overline text-accent-foreground">
                    {t('channels.members.me')}
                </span>
            )}
            {showKebab && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label={t('channels.members.remove')}
                            className="focus-ring flex items-center justify-center rounded p-1 text-muted-foreground opacity-0 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        >
                            <MoreHorizontal size={16} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                            onClick={() => onKick(member.id)}
                            className={cn('cursor-pointer text-destructive focus:text-destructive')}
                        >
                            {t('channels.members.remove')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
};
