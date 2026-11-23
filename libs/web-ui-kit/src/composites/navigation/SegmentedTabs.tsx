import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface SegmentedTabsItem {
    id: string;
    label: string;
    count?: number;
}

export interface SegmentedTabsProps {
    items: SegmentedTabsItem[];
    value: string;
    onChange: (id: string) => void;
    variant?: 'fill' | 'inline';
    trailing?: React.ReactNode;
    className?: string;
}

export const SegmentedTabs = ({
    items,
    value,
    onChange,
    variant = 'fill',
    trailing,
    className,
}: SegmentedTabsProps) => {
    const listRef = React.useRef<HTMLDivElement>(null);
    const activeIndex = items.findIndex(item => item.id === value);

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
        listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    };

    const renderTab = (item: SegmentedTabsItem) => {
        const isActive = item.id === value;
        const showCount = (item.count ?? 0) > 0;
        const common = {
            type: 'button' as const,
            role: 'tab',
            'aria-selected': isActive,
            tabIndex: isActive ? 0 : -1,
            onClick: () => onChange(item.id),
        };
        if (variant === 'inline') {
            return (
                <button key={item.id} {...common} className="flex shrink-0 flex-col items-center gap-2 pt-2">
                    <span
                        className={cn(
                            'flex items-center gap-1 whitespace-nowrap text-[14px] leading-normal tracking-[-0.28px] transition-colors duration-200 motion-reduce:transition-none',
                            isActive ? 'text-foreground' : 'font-medium text-tab-idle'
                        )}
                    >
                        <span className={cn(isActive && 'font-bold')}>{item.label}</span>
                        {showCount && (
                            <span className={cn('font-medium', isActive && 'text-nav-ink')}>{item.count}</span>
                        )}
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
        }
        return (
            <button
                key={item.id}
                {...common}
                className={cn(
                    'flex-1 border-b-2 px-4 py-3 text-[15px] font-semibold leading-[1.4] tracking-[-0.075px] transition-colors',
                    isActive
                        ? 'border-foreground text-foreground'
                        : 'border-transparent text-placeholder active:text-label'
                )}
            >
                {item.label}
                {showCount && <span className="ml-1">{item.count}</span>}
            </button>
        );
    };

    const list = (
        <div
            ref={listRef}
            role="tablist"
            onKeyDown={handleKeyDown}
            className={cn(
                variant === 'inline' ? 'flex min-w-0 flex-1 items-center gap-5 overflow-x-auto' : 'flex w-full',
                variant === 'fill' && 'border-b border-input-border',
                variant === 'fill' && !trailing && className
            )}
        >
            {items.map(renderTab)}
        </div>
    );

    if (variant === 'fill' && !trailing) return list;
    return (
        <div
            className={cn(
                'flex w-full items-center border-b border-input-border',
                variant === 'inline' && 'gap-5 px-4',
                className
            )}
        >
            {list}
            {trailing && <div className="flex shrink-0 items-center">{trailing}</div>}
        </div>
    );
};
