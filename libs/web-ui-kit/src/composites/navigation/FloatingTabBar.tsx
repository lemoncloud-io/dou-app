import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface FloatingTabBarItem {
    /** Stable identifier passed back to `onSelect`. */
    key: string;
    /** Tab label under the icon. */
    label: string;
    /** Icon node (24×24). A slot so the host supplies the exact Figma glyph — the
     *  library stays icon-agnostic. */
    icon: React.ReactNode;
    /** Icon node shown when the tab is active; falls back to `icon`. */
    activeIcon?: React.ReactNode;
    /** Unread count for a corner badge. `<= 0` hides it; above `badgeMax` → "+max". */
    badge?: number;
    /**
     * Accessible announcement for the badge (e.g. a localized "5개 안 읽음").
     * Folded into the tab's accessible name so a screen reader announces the
     * count with context. Defaults to "{label}, {count}". i18n-agnostic.
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
 * Floating bottom navigation — the Figma "떠 있는" tab bar (node 1937:26572). A
 * full-width overlay area pinned to the bottom with a soft gradient behind, and a
 * centered glass pill holding the tabs. The active tab is a dark filled pill; a
 * corner badge shows unread counts.
 *
 * Stateless and i18n-agnostic: active state, labels, icons and badges are passed
 * in; the host owns routing via `onSelect`. Self-positions with `fixed` so it
 * floats over the scrolling body — the outer area lets touches pass through and
 * only the pill is interactive; the body scrolls fully visible behind it (no
 * backdrop). Honors the bottom safe-area inset.
 */
export const FloatingTabBar = ({ items, onSelect, badgeMax = 999, className }: FloatingTabBarProps) => {
    return (
        <div
            className={cn(
                'pointer-events-none fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[430px] justify-center',
                className
            )}
            style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 18px)' }}
        >
            <nav className="pointer-events-auto relative flex h-[62px] items-center gap-[18px] rounded-[300px] border border-white/40 bg-white/70 px-[26px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)] backdrop-blur-[20px] dark:border-white/10 dark:bg-[rgba(40,40,40,0.85)]">
                {items.map(item => {
                    const isActive = !!item.active;
                    const showBadge = (item.badge ?? 0) > 0;
                    const badgeText = showBadge
                        ? (item.badge as number) > badgeMax
                            ? `+${badgeMax}`
                            : String(item.badge)
                        : '';
                    // Fold the count into the accessible name — an aria-label on the button would
                    // otherwise hide the badge text from screen readers.
                    const ariaLabel = showBadge ? (item.badgeLabel ?? `${item.label}, ${badgeText}`) : item.label;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => onSelect(item.key)}
                            aria-label={ariaLabel}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                                'relative flex size-12 flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors',
                                // Figma 3293-40098: the active pill is a translucent navy (the glass
                                // bar tints it). Dark mode keeps its own fill — Figma ships light only.
                                isActive ? 'bg-[rgba(3,13,35,0.7)] dark:bg-white/15' : 'bg-transparent'
                            )}
                        >
                            {/* The inactive fade (Figma `opacity-54`) is applied to the icon and label
                                individually, NOT to the button: on the button it would also fade the
                                unread badge, which the design keeps at full strength precisely because
                                it must stay salient on the tab you are *not* on. */}
                            <span
                                className={cn(
                                    'flex size-6 items-center justify-center',
                                    isActive ? 'text-white' : 'text-label opacity-[0.54]'
                                )}
                            >
                                {isActive ? (item.activeIcon ?? item.icon) : item.icon}
                            </span>
                            <span
                                className={cn(
                                    'text-[11px] leading-[12px] tracking-[-0.1px]',
                                    isActive ? 'font-semibold text-white' : 'font-medium text-label opacity-[0.54]'
                                )}
                            >
                                {item.label}
                            </span>
                            {showBadge && (
                                <span
                                    aria-hidden="true"
                                    className="absolute -top-1 left-[calc(50%+6px)] flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#F41F52] px-1 text-[10px] font-semibold leading-none text-white"
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
