import { useTranslation } from 'react-i18next';

import { MoreHorizontal } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback } from '@chatic/ui-kit/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import type { ChannelMember } from '../hooks';
import { avatarStyle } from '../../../shared';

interface MemberRowProps {
    member: ChannelMember;
    isMe: boolean;
    /** Whether the current user can remove (kick) other members. */
    canKick: boolean;
    onKick: (userId: string) => void;
}

const displayNameOf = (member: ChannelMember): string => member.name ?? member.nick ?? member.id;

export const MemberRow = ({ member, isMe, canKick, onKick }: MemberRowProps) => {
    const { t } = useTranslation();
    const name = displayNameOf(member);
    const initial = name.charAt(0).toUpperCase() || '?';
    const showKebab = canKick && !isMe;

    return (
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
            <Avatar className="size-8 shrink-0">
                <AvatarFallback className="text-xs font-semibold" style={avatarStyle(member.id || name)}>
                    {initial}
                </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-sm text-foreground">{name}</span>
            {member.isOwner && (
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                    {t('channels.members.owner')}
                </span>
            )}
            {isMe && (
                <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-foreground">
                    {t('channels.members.me')}
                </span>
            )}
            {showKebab && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label={t('channels.members.remove')}
                            className="flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
