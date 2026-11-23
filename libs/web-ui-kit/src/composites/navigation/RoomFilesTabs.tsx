import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface RoomFilesTab {
    key: string;
    label: string;
    count?: number;
}

export interface RoomFilesTabsProps {
    tabs: RoomFilesTab[];
    value: string;
    onChange: (key: string) => void;
    dimmed?: boolean;
    className?: string;
}

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
