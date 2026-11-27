import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { UnreadBadge } from '@chatic/design-system-components-mobile';

export interface MessageRowProps {
    variant?: 'mine' | 'other';
    avatar?: React.ReactNode;
    children: React.ReactNode;
    time?: string;
    unread?: number;
    status?: React.ReactNode;
    wide?: boolean;
    className?: string;
}

export const MessageRow = ({
    variant = 'other',
    avatar,
    children,
    time,
    unread,
    status,
    wide = false,
    className,
}: MessageRowProps) => {
    const mine = variant === 'mine';

    const meta = (time || unread != null || status) && (
        <div
            className={cn(
                'flex items-center gap-2 text-[12px] leading-4 tracking-[-0.18px] text-description',
                mine && 'flex-row-reverse'
            )}
        >
            {time && <span>{time}</span>}
            {status}
            {unread != null && <UnreadBadge count={unread} />}
        </div>
    );

    return (
        <div className={cn('flex w-full gap-[5px] px-4', mine ? 'justify-end' : 'items-start', className)}>
            {!mine && <span className="shrink-0">{avatar}</span>}
            <div
                className={cn(
                    'flex min-w-0 flex-col gap-1.5',
                    wide ? 'flex-1' : 'max-w-[75%]',
                    mine ? 'items-end' : 'items-start'
                )}
            >
                {children}
                {meta}
            </div>
        </div>
    );
};
