import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface SelectableCardProps {
    title: string;
    leading?: React.ReactNode;
    trailingLabel?: string;
    checked: boolean;
    onToggle?: (next: boolean) => void;
    disabled?: boolean;
    className?: string;
}

export const SelectableCard = ({
    title,
    leading,
    trailingLabel,
    checked,
    onToggle,
    disabled = false,
    className,
}: SelectableCardProps) => {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onToggle?.(!checked)}
            className={cn(
                'flex w-full items-center rounded-[20px] border border-secondary bg-card px-1 py-2 text-left',
                'shadow-[0_2px_7px_rgba(0,0,0,0.08)] dark:border-border dark:shadow-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
        >
            <span className="flex min-w-0 flex-1 items-center gap-1 py-2 pl-4 pr-3">
                <span className="flex min-w-0 flex-1 items-center gap-2 px-1 py-2">
                    {leading && (
                        <span className="flex size-[42px] shrink-0 items-center justify-center">{leading}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[1.4] tracking-[-0.08px] text-foreground">
                        {title}
                    </span>
                    {trailingLabel && (
                        <span className="shrink-0 text-[15px] font-semibold leading-[1.4] tracking-[-0.075px] text-main-accent">
                            {trailingLabel}
                        </span>
                    )}
                </span>
                <span
                    aria-hidden
                    data-checked={checked}
                    className={cn(
                        'flex size-[25px] shrink-0 items-center justify-center rounded-full border-2',
                        checked ? 'border-primary' : 'border-control-idle'
                    )}
                >
                    {checked && <span className="size-[13px] rounded-full bg-primary" />}
                </span>
            </span>
        </button>
    );
};
