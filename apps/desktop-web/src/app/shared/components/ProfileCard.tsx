import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy, MessageCircle, StickyNote } from 'lucide-react';

import { runtime } from '@chatic/app-runtime';

import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';

import { useCopyToClipboard, useDisplayProfile, useStartDm, useUser } from '../hooks';
import { useProfilePanelStore } from '../stores/useProfilePanelStore';
import { avatarStyle } from '../utils';

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
    /**
     * Called once "Message" has opened the 1:1 (or, on my own card, "Notes to self" has opened my
     * room), so the surface showing the card gets out of the way. Both the popover and the panel
     * pass it: opening the room you are already in selects no new channel, so nothing else would
     * close them.
     */
    onClose?: () => void;
}

/**
 * Card body. Rendered only while the popover is open (Radix unmounts closed
 * content), so the user subscription lives only for the open card — never one
 * per message row. Other users expose just avatar/name/nick, so the card stays
 * deliberately minimal: plain banner, identity, a Message action ("Notes to self" on my own card),
 * and a copy-id row. Also reused as
 * the body of the trailing ProfilePanel (without onExpand).
 */
export const ProfileCardContent = ({
    userId,
    fallbackName,
    fallbackThumbnail,
    colorSeed,
    isOwner,
    isMe,
    onExpand,
    onClose,
}: ProfileCardContentProps) => {
    const { t } = useTranslation();
    const user = useUser(userId || null);
    const [copied, copy] = useCopyToClipboard();
    const { startDm, openSelf, isStarting, isAvailable: canStartDm, canOpenSelf } = useStartDm();
    // Not every host passes `isMe` (a mention in a message does not), and either of my ids —
    // the account one or this cloud's — can be the one on the card.
    const myUid = runtime.session.useSessionIdentity().userId;
    const myCloudUid = runtime.session.useUidInCloud(runtime.session.useGlobalSession().cloud.cloudId ?? '');
    const isMine = !!isMe || userId === myUid || userId === myCloudUid;
    // My own card offers my notes-to-self room where anyone else's offers a 1:1 with them.
    const handleOpenRoom = async () => {
        if (await (isMine ? openSelf() : startDm(userId))) onClose?.();
    };
    const showMessage = isMine ? canOpenSelf : !!userId && canStartDm;

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
    // `channelIds` gathers the channels where this device has seen the person in a member list,
    // and a member list is only ever loaded for my own channels: these are the channels we share,
    // as far as this device knows (the list is a union, so a channel one of us left can linger).
    // On my own card that is just "my channels", which the card has no reason to count.
    const sharedChannelCount = isMine ? 0 : (user?.channelIds?.length ?? 0);

    return (
        <div>
            {/* A plain band. It was a two-hue gradient per person: the only gradient in
                the app, and a colour the palette has nowhere else. */}
            <div className="h-16 w-full bg-muted" />
            <div className="px-4 pb-4">
                <Avatar className="-mt-8 size-16 ring-4 ring-popover">
                    {thumbnail && <AvatarImage src={thumbnail} alt={name} />}
                    <AvatarFallback className="text-title font-semibold" style={avatarStyle(seed)}>
                        {initial}
                    </AvatarFallback>
                </Avatar>

                <div className="mt-3 flex items-center gap-2">
                    <span className="truncate text-lead font-bold tracking-tight text-foreground">{name}</span>
                    {isOwner && (
                        <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-nano font-semibold uppercase text-primary-ink">
                            {t('channels.members.owner')}
                        </span>
                    )}
                </div>
                {nick && <span className="block truncate text-callout text-muted-foreground">@{nick}</span>}
                {sharedChannelCount > 0 && (
                    <span className="mt-0.5 block text-micro text-muted-foreground">
                        {t('profile.sharedChannelCount', { count: sharedChannelCount })}
                    </span>
                )}

                {showMessage && (
                    <button
                        type="button"
                        onClick={handleOpenRoom}
                        disabled={isStarting}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-micro font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                        {isMine ? <StickyNote size={14} aria-hidden /> : <MessageCircle size={14} aria-hidden />}
                        {t(isMine ? 'dm.new.self' : 'dm.start.message')}
                    </button>
                )}

                {/* The numeric id is for support, not for a teammate glancing at a
                    card, and it led the popover with a copy button. It stays in the
                    full profile (this body with no `onExpand`), where someone looking
                    for it has gone on purpose. */}
                {userId && !onExpand && (
                    <button
                        type="button"
                        onClick={() => copy(userId)}
                        className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <span className="flex min-w-0 flex-col">
                            <span className="text-nano font-medium uppercase tracking-wide text-muted-foreground">
                                {t('profile.id')}
                            </span>
                            <span className="truncate text-micro text-foreground">{userId}</span>
                        </span>
                        {copied ? (
                            <Check size={14} className="shrink-0 text-primary-ink" />
                        ) : (
                            <Copy size={14} className="shrink-0 text-muted-foreground" />
                        )}
                    </button>
                )}

                {onExpand && (
                    <button
                        type="button"
                        onClick={onExpand}
                        className="mt-3 w-full rounded-lg border border-border bg-accent/40 px-3 py-2 text-center text-micro font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    onClose={() => setOpen(false)}
                />
            </PopoverContent>
        </Popover>
    );
};
