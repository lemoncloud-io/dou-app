import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconChevronRight } from '../../resources/icons';

export interface MessageBubbleProps {
    variant?: 'mine' | 'other';
    children: React.ReactNode;
    onExpand?: () => void;
    expandLabel?: string;
    className?: string;
}

export const MessageBubble = ({
    variant = 'other',
    children,
    onExpand,
    expandLabel = 'View all',
    className,
}: MessageBubbleProps) => {
    const mine = variant === 'mine';
    return (
        <div
            data-variant={variant}
            className={cn(
                'group/bubble w-fit min-w-0 max-w-full px-[14px] py-2 text-[16px] leading-[1.28] tracking-[-0.08px]',
                mine
                    ? 'rounded-b-[18px] rounded-tl-[18px] bg-bubble-mine text-bubble-mine-foreground'
                    : 'rounded-b-[18px] rounded-tr-[18px] bg-bubble-other text-bubble-other-foreground [[data-highlight]_&]:bg-background [[data-highlight]_&]:ring-1 [[data-highlight]_&]:ring-inset [[data-highlight]_&]:ring-primary',
                className
            )}
        >
            <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{children}</span>
            {onExpand && (
                <button
                    type="button"
                    onClick={onExpand}
                    className={cn(
                        'mt-2 flex items-center gap-0.5 text-[14px] font-medium',
                        mine ? 'text-bubble-mine-foreground/80' : 'text-description'
                    )}
                >
                    {expandLabel}
                    <IconChevronRight className="size-4" />
                </button>
            )}
        </div>
    );
};
