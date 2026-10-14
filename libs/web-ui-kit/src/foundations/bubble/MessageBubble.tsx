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
 *
 * The root is a named group (`group/bubble`) carrying `data-variant`, so content drawn inside can
 * pick a tint for the ground it sits on without being told: `mine` is navy in both themes, which a
 * fixed dark tint (right for the light bubble) disappears into. CodeBlock and InlineCode read it.
 */
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
                    : 'rounded-b-[18px] rounded-tr-[18px] bg-bubble-other text-bubble-other-foreground',
                className
            )}
        >
            {/* `overflow-wrap: anywhere`, not `break-words`: only `anywhere` also shrinks the
                min-content width, which is what the `w-fit` / `max-w-full` sizing above (and the
                row's 75% cap) is measured against. With `break-word` a single very long token
                keeps its full min-content width and blows the bubble out of the row. */}
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
