import * as React from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@chatic/ui-kit/components/ui/dropdown-menu';

import { cn } from '@chatic/lib/utils';

import { DefaultAvatar } from '../../foundations/avatar/DefaultAvatar';
import { IconBack, IconMore } from '../../resources/icons';
import { HeaderGlass } from './HeaderGlass';

export interface ChatRoomHeaderProps {
    /**
     * Selects the fallback avatar glyph when no `avatar` node is supplied:
     * `direct` = single-person lucide glyph (a peer), `group` = three-person glyph
     * (a channel), `self` = solid single-person silhouette with a ring (the
     * "나와의 채팅" design). All kinds render identically otherwise — a leading
     * avatar + left-aligned name next to the back button.
     */
    kind?: 'direct' | 'group' | 'self';
    /** Room / peer title. */
    title?: string;
    /**
     * Leading avatar node (e.g. the channel thumbnail as an `<img>`). Falls back
     * to a default glyph — person for `direct`, group for `group` — when omitted.
     */
    avatar?: React.ReactNode;
    /**
     * Optional secondary row rendered under the title (e.g. a group participant
     * stack + member count). When omitted the header stays a single line, so
     * direct / self chats are unaffected. (Figma group top bar, node 3209:27063.)
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
    /**
     * Identity not resolved yet: the avatar and title render as placeholders and `meta` is held
     * back. Without it a room opens on whatever the host had to invent for a channel it has not
     * loaded — an "unnamed channel" label and a fallback glyph — which then snaps to the real name
     * a beat later, and reads as the wrong room having opened.
     */
    loading?: boolean;
    className?: string;
}

const SLOT = 'flex size-11 shrink-0 items-center justify-center';

/**
 * Chat room header — the Figma chat "top bar": a leading avatar + left-aligned
 * room/peer name hugging the back button, with an overflow (⋯) button on the
 * right. `kind` only chooses the fallback avatar glyph (person vs. group). Side
 * slots reserve equal width so the title zone stays balanced. The overflow
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
    loading = false,
    className,
}: ChatRoomHeaderProps) => {
    // The avatar has two images, so `direct` and `self` share the single-person one — only a group
    // room gets its own glyph.
    const fallbackVariant = kind === 'group' ? 'group' : 'user';

    const moreButton = (
        <button type="button" onClick={moreMenu ? undefined : onMore} aria-label={moreLabel} className={SLOT}>
            <IconMore className="size-[26px] text-foreground" />
        </button>
    );

    return (
        <header
            className={cn(
                // Glass overlay header (Figma 3421-59848): translucent white so the scrolled
                // content shows through when the header floats above it (z-index overlay layout).
                // The fill lives here and is opaque from the first frame; only the blur behind it
                // fades in (HeaderGlass), so the title never sits over raw message text.
                'relative flex w-full flex-col bg-white/[0.32] px-1.5 pb-2 dark:bg-black/[0.32]',
                // Keep at least the base 8px top padding, plus the safe-area inset.
                safeArea ? 'pt-[calc(var(--safe-top,0px)+0.5rem)]' : 'pt-2',
                className
            )}
        >
            <HeaderGlass />

            {/* `relative` so the row paints above the frosted pane, which is positioned too. */}
            <div className="relative flex w-full items-center justify-between">
                <div className={SLOT}>
                    {onBack && (
                        <button type="button" onClick={onBack} aria-label={backLabel} className={SLOT}>
                            <IconBack className="size-[26px] text-foreground" />
                        </button>
                    )}
                </div>

                <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
                    {loading ? (
                        <div className="size-[42px] shrink-0 animate-pulse rounded-full bg-muted" />
                    ) : (
                        (avatar ?? <DefaultAvatar size={42} variant={fallbackVariant} />)
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                        {loading ? (
                            // Sized to the title's own line box so settling on the real name does
                            // not change the header's height — and with it the list's top inset.
                            <div className="flex h-[26px] items-center">
                                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                            </div>
                        ) : (
                            <p className="min-w-0 truncate text-[16px] font-semibold leading-[26px] tracking-[-0.08px] text-foreground">
                                {title}
                            </p>
                        )}
                        {!loading && meta && <div className="min-w-0">{meta}</div>}
                    </div>
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
        </header>
    );
};
