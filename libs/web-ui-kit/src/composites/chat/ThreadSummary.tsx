import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconAtSign } from '../../resources/icons';

export interface ThreadSummaryProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> {
    avatars?: React.ReactNode[];
    overflowCount?: number;
    replyLabel: string;
    newReplyLabel?: string;
    mentionLabel?: string;
    preview?: string;
    time?: string;
    align?: 'start' | 'end';
}

const TEXT = 'whitespace-nowrap text-[10px] leading-[14px] tracking-[-0.2px]';

export const ThreadSummary = React.forwardRef<HTMLButtonElement, ThreadSummaryProps>(
    (
        {
            avatars = [],
            overflowCount = 0,
            replyLabel,
            newReplyLabel,
            mentionLabel,
            preview,
            time,
            align = 'start',
            className,
            ...props
        },
        ref
    ) => {
        const end = align === 'end';
        const faces =
            avatars.length > 0 || overflowCount > 0 ? (
                <span className="flex shrink-0 items-center">
                    {avatars.map((avatar, index) => (
                        <span key={index} className="-mr-1 flex size-5 shrink-0 items-center last:mr-0">
                            {avatar}
                        </span>
                    ))}
                    {overflowCount > 0 && (
                        <span className="flex shrink-0 items-center justify-center rounded-3xl border border-background bg-input-border px-1 py-[3px] text-[10px] leading-none text-foreground">
                            +{overflowCount}
                        </span>
                    )}
                </span>
            ) : null;
        const timeLabel = time ? (
            <span className={cn(TEXT, 'shrink-0 font-medium text-description')}>{time}</span>
        ) : null;

        return (
            <button
                ref={ref}
                type="button"
                className={cn(
                    'flex w-fit max-w-full flex-col gap-1 px-1 text-left active:opacity-70',
                    end ? 'items-end' : 'items-start',
                    className
                )}
                {...props}
            >
                <span className={cn('flex max-w-full items-center gap-1.5', end && 'flex-row-reverse')}>
                    {faces}
                    <span className={cn(TEXT, 'shrink-0 font-medium text-foreground')}>{replyLabel}</span>
                    {!newReplyLabel && timeLabel}
                </span>
                {newReplyLabel && (
                    <span className={cn('flex max-w-full items-center gap-1.5', end && 'flex-row-reverse')}>
                        <span
                            data-new-replies
                            className="flex min-w-0 items-center gap-1 rounded bg-point-blue/[0.08] p-1"
                        >
                            <span className={cn(TEXT, 'shrink-0 font-semibold text-point-blue')}>{newReplyLabel}</span>
                            {mentionLabel && (
                                <span className="flex shrink-0 items-center gap-px text-point-orange">
                                    <IconAtSign size={10} strokeWidth={2.5} aria-hidden />
                                    <span className={cn(TEXT, 'font-semibold tracking-[-0.3px]')}>{mentionLabel}</span>
                                </span>
                            )}
                            {preview && (
                                <span className={cn(TEXT, 'min-w-0 truncate text-description')}>{preview}</span>
                            )}
                        </span>
                        {timeLabel}
                    </span>
                )}
            </button>
        );
    }
);
ThreadSummary.displayName = 'ThreadSummary';
