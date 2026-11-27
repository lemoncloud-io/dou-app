import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface PlaceChipProps {
    name: string;
    avatar?: React.ReactNode;
    unread?: number;
    max?: number;
    selected?: boolean;
    onClick?: () => void;
    unreadLabel?: string;
    className?: string;
}

export const PlaceChip = ({
    name,
    avatar,
    unread = 0,
    max = 999,
    selected = false,
    onClick,
    unreadLabel,
    className,
}: PlaceChipProps) => {
    const showUnread = unread > 0;
    const unreadText = unread > max ? `+${max}` : String(unread);
    const initial = Array.from(name.trim())[0] ?? '';
    const padding = selected || showUnread ? 'py-1 pl-1.5 pr-2' : 'p-1';
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            aria-label={showUnread ? `${name}, ${unreadLabel ?? unreadText}` : name}
            className={cn(
                'inline-flex max-w-[200px] shrink-0 items-center rounded-[20px] border-[0.5px]',
                'transition-[background-color,border-color,padding,transform] duration-300 ease-out active:scale-95 motion-reduce:transition-none',
                padding,
                selected ? 'border-transparent bg-chip-ink' : 'border-input-border bg-chip-surface',
                className
            )}
        >
            {avatar ?? (
                <span
                    aria-hidden
                    className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-[14px] tracking-[-0.22px]',
                        'transition-colors duration-300 motion-reduce:transition-none',
                        selected ? 'bg-tile-ring text-chip-ink' : 'bg-chip-ink text-white'
                    )}
                >
                    {initial}
                </span>
            )}
            <span
                aria-hidden={!selected}
                data-testid="place-chip-name"
                className={cn(
                    'grid min-w-0 transition-[grid-template-columns,opacity] duration-300 ease-out motion-reduce:transition-none',
                    selected ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0'
                )}
            >
                <span className="min-w-0 overflow-hidden">
                    <span
                        className={cn(
                            'block w-max max-w-[118px] truncate pl-1.5 text-[13px] font-medium tracking-[-0.26px] transition-colors duration-300 motion-reduce:transition-none',
                            selected ? 'text-white' : 'text-foreground'
                        )}
                    >
                        {name}
                    </span>
                </span>
            </span>
            {showUnread && (
                <span
                    aria-hidden
                    className={cn(
                        'flex shrink-0 items-center justify-center rounded-full bg-point-pink px-1.5 py-[3px] text-[11px] font-semibold leading-[11px] tracking-[-0.11px] text-white',
                        'transition-[margin] duration-300 ease-out animate-in fade-in-0 zoom-in-75 motion-reduce:animate-none motion-reduce:transition-none',
                        selected ? 'ml-1.5' : 'ml-1'
                    )}
                >
                    {unreadText}
                </span>
            )}
        </button>
    );
};
