import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';

import { useCopyToClipboard, useUser } from '../hooks';
import { avatarStyle, bannerStyle } from '../utils';

interface UserProfilePopoverProps {
    userId: string;
    /** Identity shown before the fetch resolves and if the user can't be found. */
    fallbackName?: string;
    /** Renders the Owner pill (member list passes member.isOwner). */
    isOwner?: boolean;
    /** The trigger element (avatar/name) — rendered via Radix `asChild`. */
    children: ReactNode;
}

/**
 * Card body. Rendered only while the popover is open (Radix unmounts closed
 * content), so the user subscription lives only for the open card — never one
 * per message row. Other users expose just avatar/name/nick, so the card stays
 * deliberately minimal: hue banner, identity, and a copy-id row.
 */
const ProfileCardContent = ({ userId, fallbackName, isOwner }: Omit<UserProfilePopoverProps, 'children'>) => {
    const { t } = useTranslation();
    const user = useUser(userId || null);
    const [copied, copy] = useCopyToClipboard();

    const name = user?.name ?? user?.nick ?? fallbackName ?? userId;
    const nick = user?.nick && user.nick !== name ? user.nick : undefined;
    const initial = name.charAt(0).toUpperCase() || '?';
    const seed = userId || name;
    const thumbnail = user?.thumbnail;
    const channelCount = user?.channelIds?.length ?? 0;

    const handleCopy = () => {
        if (userId) copy(userId);
    };

    return (
        <div>
            <div className="h-16 w-full" style={bannerStyle(seed)} />
            <div className="px-4 pb-4">
                <Avatar className="-mt-8 size-16 ring-4 ring-popover">
                    {thumbnail && <AvatarImage src={thumbnail} alt={name} />}
                    <AvatarFallback className="text-lg font-semibold" style={avatarStyle(seed)}>
                        {initial}
                    </AvatarFallback>
                </Avatar>

                <div className="mt-3 flex items-center gap-2">
                    <span className="truncate text-base font-bold tracking-tight text-foreground">{name}</span>
                    {isOwner && (
                        <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                            {t('channels.members.owner')}
                        </span>
                    )}
                </div>
                {nick && <span className="block truncate text-sm text-muted-foreground">@{nick}</span>}
                {channelCount > 0 && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t('profile.channelCount', { count: channelCount })}
                    </span>
                )}

                {userId && (
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="mt-4 flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <span className="flex min-w-0 flex-col">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                {t('profile.id')}
                            </span>
                            <span className="truncate text-xs text-foreground">{userId}</span>
                        </span>
                        {copied ? (
                            <Check size={14} className="shrink-0 text-primary" />
                        ) : (
                            <Copy size={14} className="shrink-0 text-muted-foreground" />
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};

/**
 * Click a member's avatar or name → read-only profile card popover. The card
 * itself fetches lazily, so wrapping every message row is cheap. Built-in Radix
 * fade+zoom gives the restrained entrance.
 */
export const UserProfilePopover = ({ userId, fallbackName, isOwner, children }: UserProfilePopoverProps) => (
    <Popover>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent align="start" side="right" className="w-64 overflow-hidden p-0">
            <ProfileCardContent userId={userId} fallbackName={fallbackName} isOwner={isOwner} />
        </PopoverContent>
    </Popover>
);
