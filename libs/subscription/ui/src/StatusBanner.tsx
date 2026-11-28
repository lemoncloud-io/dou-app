import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconChevronRight } from '@chatic/design-system-assets/icons';

export interface StatusBannerProps {
    icon: React.ReactNode;
    title: string;
    description: React.ReactNode;
    tone?: 'info' | 'danger';
    chip?: string;
    onClick?: () => void;
    action?: { label: string; onClick: () => void };
    className?: string;
}

export const StatusBanner = ({
    icon,
    title,
    description,
    tone = 'info',
    chip,
    onClick,
    action,
    className,
}: StatusBannerProps) => {
    const rootClassName = cn(
        'flex w-full flex-col gap-3 rounded-[16px] bg-card px-4 py-5 text-left',
        'shadow-[0_2px_6px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none',
        onClick && !action && 'active:bg-muted/50',
        className
    );

    const titleRowClassName = 'flex w-full items-center gap-2 text-left';
    const titleRow = (
        <>
            <span className="flex size-6 shrink-0 items-center justify-center">{icon}</span>
            <span className="min-w-0 flex-1 text-[16px] font-semibold leading-[1.44] tracking-[-0.08px] text-[#1C274C] dark:text-foreground">
                {title}
            </span>
            {onClick && <IconChevronRight aria-hidden className="size-6 shrink-0 text-description" />}
        </>
    );

    const content = (
        <>
            {action && onClick ? (
                <button type="button" onClick={onClick} className={cn(titleRowClassName, 'active:opacity-70')}>
                    {titleRow}
                </button>
            ) : (
                <span className={titleRowClassName}>{titleRow}</span>
            )}
            <span
                className={cn(
                    'block text-[14px] font-medium leading-[1.5] tracking-[-0.07px]',
                    tone === 'danger' ? 'text-destructive' : 'text-point-blue'
                )}
            >
                {description}
            </span>
            {chip && (
                <span className="self-start rounded-full border border-tile-ring px-3 py-1.5 text-[14px] font-medium leading-[1.4] tracking-[-0.07px] text-foreground">
                    {chip}
                </span>
            )}
            {action && (
                <button
                    type="button"
                    onClick={action.onClick}
                    className="flex w-full items-center justify-between rounded-full bg-foreground py-4 pl-6 pr-5 text-[15px] font-semibold leading-[1.3] text-background active:opacity-80"
                >
                    {action.label}
                    <IconChevronRight aria-hidden className="size-[18px] shrink-0" />
                </button>
            )}
        </>
    );

    if (onClick && !action) {
        return (
            <button type="button" onClick={onClick} className={rootClassName}>
                {content}
            </button>
        );
    }

    return <section className={rootClassName}>{content}</section>;
};
