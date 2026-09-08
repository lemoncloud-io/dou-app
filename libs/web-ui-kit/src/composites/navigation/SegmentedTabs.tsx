import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface SegmentedTabsItem {
    /** Stable identifier passed back to `onChange`. */
    id: string;
    /** Tab label. */
    label: string;
}

export interface SegmentedTabsProps {
    /** Tabs, left to right. Each shares the row's width equally. */
    items: SegmentedTabsItem[];
    /** Id of the selected tab. */
    value: string;
    /** Fired with the newly selected tab's `id`. */
    onChange: (id: string) => void;
    className?: string;
}

/**
 * In-page segmented tabs — the row that sits under a `PageHeader` and swaps the body beneath it.
 *
 * Distinct from {@link FloatingTabBar}, which is the app's bottom navigation: this one is content,
 * not navigation, so it does not self-position, carries no icons or badges, and the host keeps the
 * selection in its own state. Tabs divide the row equally and the active one is marked by an
 * underline rather than a filled pill, so the row reads as a divider the body hangs from.
 *
 * Stateless and i18n-agnostic. Implements the tablist keyboard contract (arrows move, wrapping at
 * both ends) so the row is operable without a pointer; the host is responsible for giving each
 * panel `role="tabpanel"` if it needs the full pairing.
 */
export const SegmentedTabs = ({ items, value, onChange, className }: SegmentedTabsProps) => {
    const listRef = React.useRef<HTMLDivElement>(null);
    const activeIndex = items.findIndex(item => item.id === value);

    // Arrows move between tabs and wrap, which is what a tablist is expected to do; Home/End jump to
    // the ends. Selection follows focus here because switching a tab is cheap and reversible.
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (items.length === 0) return;
        const from = activeIndex < 0 ? 0 : activeIndex;
        let next: number;
        switch (event.key) {
            case 'ArrowRight':
                next = (from + 1) % items.length;
                break;
            case 'ArrowLeft':
                next = (from - 1 + items.length) % items.length;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = items.length - 1;
                break;
            default:
                return;
        }
        event.preventDefault();
        onChange(items[next].id);
        // Roving tabindex moves the tab stop to the newly selected tab, so DOM focus has to follow
        // it — left behind, focus would sit on an element that is no longer reachable by Tab.
        listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    };

    return (
        <div
            ref={listRef}
            role="tablist"
            onKeyDown={handleKeyDown}
            className={cn('flex w-full border-b border-input-border', className)}
        >
            {items.map(item => {
                const isActive = item.id === value;
                return (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        // Only the active tab is a tab stop, so Tab enters the row once and the
                        // arrows take over from there.
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onChange(item.id)}
                        className={cn(
                            'flex-1 border-b-2 px-4 py-3 text-[15px] font-semibold leading-[1.4] tracking-[-0.075px] transition-colors',
                            isActive
                                ? 'border-foreground text-foreground'
                                : 'border-transparent text-placeholder active:text-label'
                        )}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
};
