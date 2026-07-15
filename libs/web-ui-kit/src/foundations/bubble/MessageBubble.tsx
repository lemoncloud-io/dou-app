import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconChevronRight } from '../../resources/icons';

export interface MessageBubbleProps {
    /** `mine` = dark bubble aligned right; `other` = light bubble aligned left. */
    variant?: 'mine' | 'other';
    children: React.ReactNode;
    /** When set, renders a "see all" affordance for long/truncated messages. */
    onExpand?: () => void;
    expandLabel?: string;
    className?: string;
}

/**
 * Chat message balloon — the Figma bubble. Two variants share one component: the
 * tail corner (sharp) mirrors by side. Purely presentational; the row layout,
 * avatar, and metadata are composed around it by MessageRow.
 */
export const MessageBubble = ({
    variant = 'other',
    children,
    onExpand,
    expandLabel = '전체보기',
    className,
}: MessageBubbleProps) => {
    const mine = variant === 'mine';
    return (
        <div
            className={cn(
                'w-fit max-w-full px-[14px] py-2 text-[16px] leading-[1.28] tracking-[-0.08px]',
                mine
                    ? 'rounded-b-[18px] rounded-tl-[18px] bg-bubble-mine text-bubble-mine-foreground'
                    : 'rounded-b-[18px] rounded-tr-[18px] bg-bubble-other text-bubble-other-foreground',
                className
            )}
        >
            <span className="whitespace-pre-wrap break-words">{children}</span>
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
