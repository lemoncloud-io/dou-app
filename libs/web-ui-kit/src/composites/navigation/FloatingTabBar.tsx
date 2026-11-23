import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface FloatingTabBarItem {
    key: string;
    label: string;
    icon: React.ReactNode;
    activeIcon?: React.ReactNode;
    badge?: number;
    badgeLabel?: string;
    dot?: boolean;
    dotLabel?: string;
    active?: boolean;
}

export interface FloatingTabBarProps {
    items: FloatingTabBarItem[];
    onSelect: (key: string) => void;
    badgeMax?: number;
    className?: string;
}

const TAB_EASE = 'duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]';
const ICON_FADE = 'transition-opacity duration-300 motion-reduce:transition-none';

export const FloatingTabBar = ({ items, onSelect, badgeMax = 999, className }: FloatingTabBarProps) => {
    const crowded = items.length > 3;
    return (
        <div
            className={cn(
                'pointer-events-none fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[var(--app-width,430px)] justify-center px-4',
                className
            )}
            style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 18px)' }}
        >
            <nav
                className={cn(
                    'pointer-events-auto flex h-[62px] max-w-full items-center gap-[5px] rounded-full p-1',
                    crowded && 'w-full',
                    'border-[0.5px] border-black/[0.06] bg-white/[0.58] backdrop-blur-[8px] backdrop-saturate-[1.8]',
                    'shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.9),inset_-1px_-1px_0_0_rgba(255,255,255,0.5),0_4px_12px_0_rgba(0,0,0,0.08)]',
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
                    const showDot = !showBadge && !!item.dot;
                    const ariaLabel = showBadge
                        ? `${item.label}, ${item.badgeLabel ?? badgeText}`
                        : showDot && item.dotLabel
                          ? `${item.label}, ${item.dotLabel}`
                          : item.label;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => onSelect(item.key)}
                            aria-label={ariaLabel}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                                'relative flex h-full shrink-0 items-center justify-center rounded-full px-6 text-nav-ink',
                                crowded && !isActive && 'min-w-14 flex-1 px-4',
                                'transition-colors duration-300 motion-reduce:transition-none',
                                isActive && 'bg-black/[0.06] dark:bg-white/10'
                            )}
                        >
                            <span className="relative flex size-6 items-center justify-center">
                                {item.activeIcon ? (
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
                                {showDot && (
                                    <span
                                        aria-hidden="true"
                                        data-dot
                                        className="absolute -right-0.5 -top-0.5 size-[7px] rounded-full bg-alert-red duration-200 animate-in fade-in-0 zoom-in-50 motion-reduce:animate-none"
                                    />
                                )}
                            </span>
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
