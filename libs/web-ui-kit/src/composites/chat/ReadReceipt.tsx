import type * as React from 'react';

import { cn } from '@chatic/ui-kit';

const MAX_READER_FACES = 3;

export interface ReadReceiptProps {
    readCount: number;
    unreadCount: number;
    readLabel: string;
    unreadLabel: string;
    allReadLabel: string;
    mode?: 'count' | 'dm' | 'readers';
    readers?: React.ReactNode[];
    className?: string;
}

export const ReadReceipt = ({
    readCount,
    unreadCount,
    readLabel,
    unreadLabel,
    allReadLabel,
    mode = 'count',
    readers = [],
    className,
}: ReadReceiptProps) => {
    const hasUnread = unreadCount > 0;

    if (mode === 'readers') {
        const line = 'flex items-center gap-1.5 whitespace-nowrap p-1 text-[10px] font-medium text-description';
        if (!hasUnread) {
            return (
                <span aria-label={allReadLabel} className={cn(line, className)}>
                    {allReadLabel}
                </span>
            );
        }
        if (readCount === 0) {
            return (
                <span aria-label={`${unreadLabel} ${unreadCount}`} className={cn(line, className)}>
                    {unreadLabel} {unreadCount}
                </span>
            );
        }
        const overflow = Math.max(0, readCount - MAX_READER_FACES);
        return (
            <span aria-label={`${readLabel} ${readCount}`} className={cn(line, className)}>
                <span>
                    {readLabel} {readCount}
                </span>
                <span aria-hidden className="flex items-center">
                    {readers.slice(0, MAX_READER_FACES).map((face, index) => (
                        <span key={index} className="-mr-1 flex size-5 shrink-0 items-center">
                            {face}
                        </span>
                    ))}
                    {overflow > 0 && (
                        <span className="flex shrink-0 items-center justify-center rounded-3xl border border-background bg-input-border px-1 py-[3px] text-[10px] leading-none tracking-[0.05px] text-foreground">
                            +{overflow}
                        </span>
                    )}
                </span>
            </span>
        );
    }

    if (mode === 'dm') {
        if (!hasUnread) return null;
        return (
            <span
                aria-label={`${unreadLabel} ${unreadCount}`}
                className={cn(
                    'flex items-center text-[12px] font-semibold leading-4 tracking-[-0.18px] text-main-accent',
                    className
                )}
            >
                {unreadCount}
            </span>
        );
    }

    const textClass = cn('flex items-center gap-1 text-[12px] font-semibold leading-4 tracking-[-0.18px]', className);

    if (!hasUnread) {
        return (
            <span aria-label={allReadLabel} className={cn(textClass, 'text-main-accent')}>
                {allReadLabel}
            </span>
        );
    }

    return (
        <span aria-label={`${readLabel} ${readCount} ${unreadLabel} ${unreadCount}`} className={textClass}>
            <span className="text-main-accent">
                {readLabel} {readCount}
            </span>
            <span aria-hidden className="text-description">
                •
            </span>
            <span className="text-description">
                {unreadLabel} {unreadCount}
            </span>
        </span>
    );
};
