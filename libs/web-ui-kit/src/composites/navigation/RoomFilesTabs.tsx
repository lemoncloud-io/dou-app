import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface RoomFilesTab {
    /** Stable identifier passed back to `onChange`. */
    key: string;
    /** Tab label (e.g. a localized "Audio"). */
    label: string;
    /** Drawn after the label ("Audio 3"). Omitted, the tab is the label alone. */
    count?: number;
}

export interface RoomFilesTabsProps {
    /** Tabs, left to right — photos·videos, files, audio, links in the room file list. */
    tabs: RoomFilesTab[];
    /** Key of the selected tab. */
    value: string;
    /** Fired with the newly selected tab's key. */
    onChange: (key: string) => void;
    /**
     * Selection mode: the row fades and no tab switches, because a pick belongs to one tab's list
     * and switching would leave it behind off screen.
     */
    dimmed?: boolean;
    className?: string;
}

/**
 * The room file list's tab row (Figma "대화방 파일 · 탭" 6072:23221): text tabs that hug their
 * label from the left with a 20px gap, 15px, a 2px underline under the selected one, the row closed
 * by a hairline. The selected tab is semibold in the strong ink; the rest medium grey.
 *
 * Stateless — the host keeps the selected key. Implements the tablist keyboard contract (arrows
 * move and wrap, Home/End jump) like `SegmentedTabs`; the host gives each panel `role="tabpanel"`.
 */
export const RoomFilesTabs = ({ tabs, value, onChange, dimmed = false, className }: RoomFilesTabsProps) => {
    const listRef = React.useRef<HTMLDivElement>(null);
    const activeIndex = tabs.findIndex(tab => tab.key === value);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (dimmed || tabs.length === 0) return;
        const from = activeIndex < 0 ? 0 : activeIndex;
        let next: number;
        switch (event.key) {
            case 'ArrowRight':
                next = (from + 1) % tabs.length;
                break;
            case 'ArrowLeft':
                next = (from - 1 + tabs.length) % tabs.length;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = tabs.length - 1;
                break;
            default:
                return;
        }
        event.preventDefault();
        onChange(tabs[next].key);
        // The roving tab stop moves with the selection, so focus has to follow it.
        listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    };

    return (
        <div
            ref={listRef}
            role="tablist"
            aria-disabled={dimmed || undefined}
            onKeyDown={handleKeyDown}
            className={cn(
                'flex h-[37px] w-full items-start gap-5 overflow-x-auto border-b border-input-border bg-surface px-4 transition-opacity duration-200 motion-reduce:transition-none',
                dimmed && 'opacity-40',
                className
            )}
        >
            {tabs.map(tab => {
                const isActive = tab.key === value;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        // Only the selected tab is a tab stop; arrows take over inside the row.
                        tabIndex={isActive && !dimmed ? 0 : -1}
                        disabled={dimmed}
                        onClick={() => {
                            if (!isActive) onChange(tab.key);
                        }}
                        className="flex shrink-0 flex-col items-stretch gap-2 pt-2 disabled:cursor-default"
                    >
                        <span
                            className={cn(
                                'whitespace-nowrap text-[15px] leading-[18px] transition-colors duration-200 motion-reduce:transition-none',
                                isActive ? 'font-semibold text-foreground' : 'font-medium text-description'
                            )}
                        >
                            {tab.label}
                            {tab.count !== undefined && ` ${tab.count}`}
                        </span>
                        <span
                            aria-hidden
                            data-underline={isActive}
                            className={cn(
                                'h-0.5 w-full origin-center bg-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
                                isActive ? 'scale-x-100' : 'scale-x-0'
                            )}
                        />
                    </button>
                );
            })}
        </div>
    );
};
