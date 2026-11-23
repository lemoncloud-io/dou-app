import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconChevronRight, IconClose } from '../../resources/icons';

export interface PromoBannerProps {
    icon?: React.ReactNode;
    title: string;
    actionLabel?: string;
    onAction?: () => void;
    onDismiss?: () => void;
    dismissLabel?: string;
    className?: string;
}

export const PromoBanner = ({
    icon,
    title,
    actionLabel,
    onAction,
    onDismiss,
    dismissLabel = 'Dismiss',
    className,
}: PromoBannerProps) => {
    return (
        <div className={cn('flex w-full items-center justify-between rounded-2xl bg-secondary p-4', className)}>
            <div className="flex min-w-0 flex-1 items-center gap-2">
                {icon && <span className="flex size-12 shrink-0 items-center justify-center">{icon}</span>}
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                    <p className="whitespace-pre-line break-words text-[15px] font-semibold leading-[1.44] tracking-[-0.075px] text-foreground">
                        {title}
                    </p>
                    {actionLabel && onAction && (
                        <button
                            type="button"
                            onClick={onAction}
                            className="flex min-w-0 items-center gap-1 self-start py-0.5 text-[14px] font-medium leading-[1.4] tracking-[-0.07px] text-point-blue"
                        >
                            <span className="truncate">{actionLabel}</span>
                            <IconChevronRight className="size-[18px]" />
                        </button>
                    )}
                </div>
            </div>
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label={dismissLabel}
                    className="ml-2 flex size-6 shrink-0 items-center justify-center text-label"
                >
                    <IconClose className="size-[18px]" />
                </button>
            )}
        </div>
    );
};
