import * as React from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@chatic/ui-kit/components/ui/dropdown-menu';

import { cn } from '@chatic/lib/utils';

import { DefaultAvatar } from '../../foundations/avatar/DefaultAvatar';
import { IconBack, IconMore } from '../../resources/icons';

export interface ChatRoomHeaderProps {
    /**
     * `direct` (1:1 — exactly one other participant) = leading peer avatar +
     * name, left-aligned next to the back button.
     * `group` (1–n participants) = room name centered, with an optional `meta`
     * row (e.g. an AvatarGroup) below it.
     */
    kind?: 'direct' | 'group';
    /** Room / peer title. */
    title?: string;
    /**
     * Leading avatar node — `direct` kind only. Falls back to a default avatar
     * glyph when the peer has no profile photo.
     */
    avatar?: React.ReactNode;
    /**
     * Meta row rendered centered below the title (e.g. an `AvatarGroup` with the
     * member count). `group` kind only; omit for `self`/`direct`.
     */
    meta?: React.ReactNode;
    /** Back button handler; omit to hide the button. */
    onBack?: () => void;
    /** Overflow (⋯) handler; omit to hide the button. Ignored when `moreMenu` is set. */
    onMore?: () => void;
    /**
     * Dropdown content for the overflow (⋯) button (e.g. a DropdownMenuItem list).
     * When set, the ⋯ button becomes a DropdownMenu trigger — the Radix primitive
     * owns the open state, so this component stays stateless. Takes precedence over
     * `onMore`.
     */
    moreMenu?: React.ReactNode;
    /** Accessible label for the back button. Host supplies a localized string. */
    backLabel?: string;
    /** Accessible label for the overflow button. Host supplies a localized string. */
    moreLabel?: string;
    /** Adds top padding for the status-bar / notch safe-area inset. */
    safeArea?: boolean;
    className?: string;
}

const SLOT = 'flex size-11 shrink-0 items-center justify-center';

/**
 * Chat room header — the Figma chat "top bar", in two kinds:
 *  - `direct` (1:1): peer avatar + name, hugging the back button.
 *  - `group`  (1–n): room name centered, with an optional meta row (member
 *    avatars + count) below it.
 * Side slots reserve equal width so the title zone stays balanced. The overflow
 * button can be a plain action (`onMore`) or a dropdown trigger (`moreMenu`).
 */
export const ChatRoomHeader = ({
    kind = 'group',
    title,
    avatar,
    meta,
    onBack,
    onMore,
    moreMenu,
    backLabel = 'Back',
    moreLabel = 'More',
    safeArea = true,
    className,
}: ChatRoomHeaderProps) => {
    const isDirect = kind === 'direct';

    const moreButton = (
        <button type="button" onClick={moreMenu ? undefined : onMore} aria-label={moreLabel} className={SLOT}>
            <IconMore className="size-[26px] text-foreground" />
        </button>
    );

    return (
        <header
            className={cn(
                'flex w-full flex-col bg-surface px-1.5 pb-2',
                // Keep at least the base 8px top padding, plus the safe-area inset.
                safeArea ? 'pt-[calc(var(--safe-top,0px)+0.5rem)]' : 'pt-2',
                className
            )}
        >
            <div className="flex w-full items-center justify-between">
                <div className={SLOT}>
                    {onBack && (
                        <button type="button" onClick={onBack} aria-label={backLabel} className={SLOT}>
                            <IconBack className="size-[26px] text-foreground" />
                        </button>
                    )}
                </div>

                <div className={cn('flex min-w-0 flex-1 items-center gap-2', isDirect ? 'px-1' : 'px-2')}>
                    {isDirect && (avatar ?? <DefaultAvatar size={42} />)}
                    <p
                        className={cn(
                            'min-w-0 flex-1 truncate text-[16px] font-semibold leading-[26px] text-foreground',
                            isDirect ? 'tracking-[-0.08px]' : 'text-center tracking-[0.08px]'
                        )}
                    >
                        {title}
                    </p>
                </div>

                <div className={SLOT}>
                    {moreMenu ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>{moreButton}</DropdownMenuTrigger>
                            <DropdownMenuContent align="end">{moreMenu}</DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        onMore && moreButton
                    )}
                </div>
            </div>

            {meta && <div className="flex w-full items-center justify-center pt-1">{meta}</div>}
        </header>
    );
};
