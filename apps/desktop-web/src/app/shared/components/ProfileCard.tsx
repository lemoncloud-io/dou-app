import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy, MessageCircle, StickyNote } from 'lucide-react';

import { runtime } from '@chatic/runtime-react';

import { Avatar, AvatarFallback, AvatarImage, Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit';

import { useCopyToClipboard, useDisplayProfile, useStartDm, useUser } from '../hooks';
import { useProfilePanelStore } from '../stores/useProfilePanelStore';
import { avatarStyle } from '../utils';

interface UserProfilePopoverProps {
    userId: string;
    fallbackName?: string;
    fallbackThumbnail?: string;
    colorSeed?: string;
    isOwner?: boolean;
    isMe?: boolean;
    children: ReactNode;
}

interface ProfileCardContentProps extends Omit<UserProfilePopoverProps, 'children'> {
    onExpand?: () => void;
    onClose?: () => void;
}

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
    const myUid = runtime.session.useSessionIdentity().userId;
    const myCloudUid = runtime.session.useUidInCloud(runtime.session.useGlobalSession().cloud.cloudId ?? '');
    const isMine = !!isMe || userId === myUid || userId === myCloudUid;
    const handleOpenRoom = async () => {
        if (await (isMine ? openSelf() : startDm(userId))) onClose?.();
    };
    const showMessage = isMine ? canOpenSelf : !!userId && canStartDm;

    const globalName = fallbackName ?? user?.name ?? user?.nick ?? userId;
    const { name, thumbnail } = useDisplayProfile(userId, globalName, fallbackThumbnail ?? user?.thumbnail);
    const nick = user?.nick && user.nick !== name ? user.nick : undefined;
    const initial = name.charAt(0).toUpperCase() || '?';
    const seed = colorSeed || userId || name;
    const sharedChannelCount = isMine ? 0 : (user?.channelIds?.length ?? 0);

    return (
        <div>
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

export const UserProfilePopover = ({
    userId,
    fallbackName,
    fallbackThumbnail,
    colorSeed,
    isOwner,
    isMe,
    children,
}: UserProfilePopoverProps) => {
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
