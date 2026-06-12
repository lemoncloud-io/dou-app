import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';

import { useCopyToClipboard, useDisplayProfile, useUser } from '../hooks';
import { useProfilePanelStore } from '../stores/useProfilePanelStore';
import { avatarStyle, bannerStyle } from '../utils';

interface UserProfilePopoverProps {
    userId: string;
    /** Identity shown before the fetch resolves and if the user can't be found. */
    fallbackName?: string;
    /** Thumbnail the trigger surface rendered — keeps the card photo in sync with what was clicked. */
    fallbackThumbnail?: string;
    /** Avatar/banner seed the trigger surface used — keeps the fallback color in sync with what was clicked. */
    colorSeed?: string;
    /** Renders the Owner pill (member list passes member.isOwner). */
    isOwner?: boolean;
    /** The signed-in user's own card (kept by hosts for action gating). */
    isMe?: boolean;
    /** The trigger element (avatar/name) — rendered via Radix `asChild`. */
    children: ReactNode;
}

interface ProfileCardContentProps extends Omit<UserProfilePopoverProps, 'children'> {
    /** Renders a "View full profile" row that hands off to the trailing panel (popover only). */
    onExpand?: () => void;
}

/**
 * Card body. Rendered only while the popover is open (Radix unmounts closed
 * content), so the user subscription lives only for the open card — never one
 * per message row. Other users expose just avatar/name/nick, so the card stays
 * deliberately minimal: hue banner, identity, and a copy-id row. Also reused as
 * the body of the trailing ProfilePanel (without onExpand).
 */
export const ProfileCardContent = ({
    userId,
    fallbackName,
    fallbackThumbnail,
    colorSeed,
    isOwner,
    onExpand,
}: ProfileCardContentProps) => {
    const { t } = useTranslation();
    const user = useUser(userId || null);
    const [copied, copy] = useCopyToClipboard();

    // The trigger's rendered identity wins over the global record: the Place
    // override may be keyed by a different uid than `userId` (own messages
    // carry the account uid while the override is keyed by the cloud uid), and
    // the global record can lag behind what the row already resolved.
    const globalName = fallbackName ?? user?.name ?? user?.nick ?? userId;
    // Display Profile: a Place nick/thumbnail overrides the global identity here too.
    const { name, thumbnail } = useDisplayProfile(userId, globalName, fallbackThumbnail ?? user?.thumbnail);
    const nick = user?.nick && user.nick !== name ? user.nick : undefined;
    const initial = name.charAt(0).toUpperCase() || '?';
    const seed = colorSeed || userId || name;
    const channelCount = user?.channelIds?.length ?? 0;

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
                        onClick={() => copy(userId)}
                        className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

                {onExpand && (
                    <button
                        type="button"
                        onClick={onExpand}
                        className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-center text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {t('profile.card.viewFull')}
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
export const UserProfilePopover = ({
    userId,
    fallbackName,
    fallbackThumbnail,
    colorSeed,
    isOwner,
    isMe,
    children,
}: UserProfilePopoverProps) => {
    // Controlled so "View full profile" can close the popover as it hands the
    // same identity snapshot off to the trailing ProfilePanel.
    const [open, setOpen] = useState(false);
    const openPanel = useProfilePanelStore(s => s.open);

    const expand = () => {
        setOpen(false);
        openPanel({ userId, fallbackName, fallbackThumbnail, colorSeed, isOwner, isMe });
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{children}</PopoverTrigger>
            <PopoverContent align="start" side="right" className="w-64 overflow-hidden p-0">
                <ProfileCardContent
                    userId={userId}
                    fallbackName={fallbackName}
                    fallbackThumbnail={fallbackThumbnail}
                    colorSeed={colorSeed}
                    isOwner={isOwner}
                    isMe={isMe}
                    onExpand={expand}
                />
            </PopoverContent>
        </Popover>
    );
};
