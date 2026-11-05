import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface FloatingTabBarItem {
    /** Stable identifier passed back to `onSelect`. */
    key: string;
    /** Tab name. Drawn beside the icon on the selected tab only; every tab carries it as its
     *  accessible name, since an unselected tab shows the icon alone. */
    label: string;
    /** Icon node (24×24), the line glyph. A slot so the host supplies the exact Figma glyph — the
     *  library stays icon-agnostic. Colour it with `currentColor`. */
    icon: React.ReactNode;
    /** Icon node shown when the tab is selected (the filled glyph); falls back to `icon`. */
    activeIcon?: React.ReactNode;
    /** Unread count for a corner badge. `<= 0` hides it; above `badgeMax` → "+max". */
    badge?: number;
    /**
     * Accessible announcement for the badge (e.g. a localized "5 unread"), without the tab's name.
     * The tab's accessible name becomes "{label}, {badgeLabel}" so a screen reader announces the
     * count with context; without it, "{label}, {count}". i18n-agnostic.
     */
    badgeLabel?: string;
    /** Whether this tab is the active destination. */
    active?: boolean;
}

export interface FloatingTabBarProps {
    /** Tabs, left to right. */
    items: FloatingTabBarItem[];
    /** Fired with the tapped item's `key`. */
    onSelect: (key: string) => void;
    /** Clamp for the unread badge. Defaults to 999. */
    badgeMax?: number;
    className?: string;
}

/**
 * How a selection change moves: one clock for the label folding and the tab widths it drives, with a
 * fast start and a long settle, so the capsule reads as sliding into place rather than toggling.
 */
const TAB_EASE = 'duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]';
/** The line and filled glyphs cross-fade on the same clock, without the motion curve. */
const ICON_FADE = 'transition-opacity duration-300 motion-reduce:transition-none';

/**
 * Floating bottom navigation — the Figma "하단 내비바 · 선택 상태" (node 5780:17209). A glass pill
 * pinned to the bottom of the screen; the selected tab is a tinted capsule holding its filled icon
 * and its name, every other tab is its line icon alone. A corner badge shows unread counts.
 *
 * Stateless and i18n-agnostic: active state, labels, icons and badges are passed in; the host owns
 * routing via `onSelect`. Self-positions with `fixed` so it floats over the scrolling body — the
 * outer area lets touches pass through and only the pill is interactive. Honors the bottom
 * safe-area inset.
 *
 * ## Width
 *
 * The design is 343 wide with four tabs spread edge to edge. The pill hugs its tabs instead, with a
 * 5px gap that lands four tabs (one 103px selected capsule, three 72px icons, 4px padding) on
 * exactly 343. With fewer tabs the pill is narrower and stays centred, rather than stretching
 * across the screen with an empty middle.
 *
 * ## Glass
 *
 * The design's surface is a Figma GLASS effect: an 8px frost plus refraction, depth and dispersion.
 * Only the frost can be reproduced in CSS on every platform this kit renders on. Refraction would
 * need an SVG displacement filter inside `backdrop-filter`, which Chromium paints but WebKit — every
 * iOS WebView — ignores, so the bar would look different on the two phones. What the design's glass
 * reads as at this size is approximated instead: the 8px frost with a saturation lift (what makes
 * the content behind look like it is seen through glass rather than fog), a bright rim on the
 * light-facing top-left edge and a fainter one opposite (the design's light comes in at 133°), and
 * the design's own drop shadow.
 */
export const FloatingTabBar = ({ items, onSelect, badgeMax = 999, className }: FloatingTabBarProps) => {
    return (
        <div
            className={cn(
                // `fixed` escapes the host's centred app column, so the bar re-declares the cap
                // itself: `inset-x-0 mx-auto` + the host's `--app-width` centres it back over that
                // column. The 430px fallback is this kit's own mobile design width, for a host
                // (or a story) that does not set the variable. `px-4` keeps the design's 16px side
                // margin once the pill grows to the full width of a 375 screen.
                'pointer-events-none fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[var(--app-width,430px)] justify-center px-4',
                className
            )}
            style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 18px)' }}
        >
            <nav
                className={cn(
                    // 62px with the hairline counted inside it, as Figma draws an inside stroke. The
                    // design is 62.84; rounding down keeps the bar on the 62 + 18 geometry the app's
                    // snackbar floor and trailing clearance are built on.
                    'pointer-events-auto flex h-[62px] max-w-full items-center gap-[5px] rounded-full p-1',
                    'border-[0.5px] border-black/[0.06] bg-white/[0.58] backdrop-blur-[8px] backdrop-saturate-[1.8]',
                    'shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.9),inset_-1px_-1px_0_0_rgba(255,255,255,0.5),0_4px_12px_0_rgba(0,0,0,0.08)]',
                    // Figma ships light only. Dark keeps the same treatment on a dark tint, with
                    // the rims dimmed so they read as an edge and not as a white outline.
                    'dark:border-white/10 dark:bg-[rgba(40,40,40,0.7)]',
                    'dark:shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.18),inset_-1px_-1px_0_0_rgba(255,255,255,0.06),0_4px_12px_0_rgba(0,0,0,0.3)]'
                )}
            >
                {items.map(item => {
                    const isActive = !!item.active;
                    const showBadge = (item.badge ?? 0) > 0;
                    const badgeText = showBadge
                        ? (item.badge as number) > badgeMax
                            ? `+${badgeMax}`
                            : String(item.badge)
                        : '';
                    // Fold the count into the accessible name — an aria-label on the button would
                    // otherwise hide the badge text from screen readers. The tab's name always leads:
                    // an unselected tab shows no text, so the label is the only thing that says
                    // which tab a "5 unread" belongs to.
                    const ariaLabel = showBadge ? `${item.label}, ${item.badgeLabel ?? badgeText}` : item.label;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => onSelect(item.key)}
                            aria-label={ariaLabel}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                                // `px-6` around a 24px icon is the unselected tab's 72px; the
                                // selected one widens by its label, so the width is never set.
                                'relative flex h-full shrink-0 items-center justify-center rounded-full px-6 text-nav-ink',
                                'transition-colors duration-300 motion-reduce:transition-none',
                                isActive && 'bg-black/[0.06] dark:bg-white/10'
                            )}
                        >
                            <span className="relative flex size-6 items-center justify-center">
                                {item.activeIcon ? (
                                    // Both glyphs stay mounted so the line one can fade into the
                                    // filled one, instead of swapping in a single frame.
                                    <>
                                        <span
                                            className={cn(
                                                'absolute inset-0 flex items-center justify-center',
                                                ICON_FADE,
                                                isActive && 'opacity-0'
                                            )}
                                        >
                                            {item.icon}
                                        </span>
                                        <span
                                            className={cn(
                                                'absolute inset-0 flex items-center justify-center',
                                                ICON_FADE,
                                                !isActive && 'opacity-0'
                                            )}
                                        >
                                            {item.activeIcon}
                                        </span>
                                    </>
                                ) : (
                                    item.icon
                                )}
                            </span>
                            {/* The label is on every tab and folds to nothing on the unselected ones.
                                A single-column grid going from `0fr` to `1fr` is what lets an
                                unknown text width animate — `width: auto` cannot — so the selected
                                tab widens and the one it replaces narrows in step, and the icons
                                between them slide rather than jump. The 8px gap is the label's own
                                padding, so it folds away with it. */}
                            <span
                                aria-hidden="true"
                                data-expanded={isActive}
                                className={cn(
                                    'grid transition-[grid-template-columns,opacity] motion-reduce:transition-none',
                                    TAB_EASE,
                                    isActive ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0'
                                )}
                            >
                                <span className="min-w-0 overflow-hidden">
                                    <span className="block whitespace-nowrap pl-2 text-[13px] font-medium leading-[14px] tracking-[-0.39px] text-foreground">
                                        {item.label}
                                    </span>
                                </span>
                            </span>
                            {showBadge && (
                                <span
                                    aria-hidden="true"
                                    data-badge-at={isActive ? 'capsule' : 'icon'}
                                    className={cn(
                                        'absolute flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#F41F52] px-1 text-[10px] font-semibold leading-none text-white',
                                        // An icon-only tab wears it on the icon's top-right corner
                                        // (the icon spans 24–48px). The selected tab's name starts
                                        // 8px after the icon, under where that badge would hang, so
                                        // there it moves to the capsule's own corner, above the name.
                                        isActive ? 'right-0 top-0' : 'left-[42px] top-[calc(50%-18px)]'
                                    )}
                                >
                                    {badgeText}
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
};
