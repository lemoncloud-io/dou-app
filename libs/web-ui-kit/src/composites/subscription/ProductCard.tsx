import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconAlert, IconChevronRight } from '../../resources/icons';

export type ProductStatusTone = 'active' | 'scheduled' | 'ended' | 'danger';

export interface ProductCardProps {
    name: string;
    badge?: React.ReactNode;
    statusLabel?: string;
    statusTone?: ProductStatusTone;
    caption?: string;
    onClick?: () => void;
    children?: React.ReactNode;
    className?: string;
}

const WARNING_TEXT = 'text-[hsl(var(--warning,38_92%_50%))]';

const STATUS_TONE_CLASS: Record<ProductStatusTone, string> = {
    active: 'text-point-blue',
    scheduled: WARNING_TEXT,
    ended: 'text-description',
    danger: 'text-destructive',
};

export const ProductCard = ({
    name,
    badge,
    statusLabel,
    statusTone = 'active',
    caption,
    onClick,
    children,
    className,
}: ProductCardProps) => {
    const headerContent = (
        <>
            {badge && <span className="flex shrink-0 items-center">{badge}</span>}
            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[1.3] tracking-[-0.08px] text-foreground">
                {name}
            </span>
            {statusLabel && (
                <span
                    className={cn(
                        'max-w-[45%] shrink-0 truncate text-right text-[16px] font-semibold leading-[1.3] tracking-[-0.08px]',
                        STATUS_TONE_CLASS[statusTone]
                    )}
                >
                    {statusLabel}
                </span>
            )}
            {onClick && <IconChevronRight aria-hidden className="size-[18px] shrink-0 text-description" />}
        </>
    );

    const headerClassName = 'flex w-full items-center gap-2 text-left';

    return (
        <div
            className={cn(
                'flex w-full flex-col rounded-[18px] bg-card px-0.5 py-2',
                'shadow-[0_2px_6px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none',
                className
            )}
        >
            <div className="flex flex-col gap-4 px-4 py-3">
                {onClick ? (
                    <button type="button" onClick={onClick} className={cn(headerClassName, 'active:opacity-70')}>
                        {headerContent}
                    </button>
                ) : (
                    <div className={headerClassName}>{headerContent}</div>
                )}
                {caption && (
                    <div className="flex items-start gap-1">
                        <IconAlert aria-hidden className="mt-px size-[18px] shrink-0 text-description" />
                        <span className="min-w-0 text-[14px] font-medium leading-[1.4] tracking-[-0.07px] text-description">
                            {caption}
                        </span>
                    </div>
                )}
            </div>
            {children && (
                <>
                    <div aria-hidden className="mx-4 h-px bg-secondary" />
                    {children}
                </>
            )}
        </div>
    );
};
