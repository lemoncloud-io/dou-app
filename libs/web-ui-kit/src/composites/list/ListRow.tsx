import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface ListRowProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    leading?: React.ReactNode;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    subtitleIcon?: React.ReactNode;
    trailing?: React.ReactNode;
    destructive?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
}

export const ListRow = ({
    leading,
    title,
    subtitle,
    subtitleIcon,
    trailing,
    destructive = false,
    onClick,
    disabled,
    className,
    ...props
}: ListRowProps) => {
    const Root = onClick ? 'button' : 'div';
    return (
        <Root
            {...props}
            {...(onClick ? { type: 'button' as const, onClick, disabled } : {})}
            className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left',
                onClick && 'active:bg-muted/50 disabled:opacity-50',
                className
            )}
        >
            {leading && <span className="flex shrink-0 items-center">{leading}</span>}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                    className={cn(
                        'flex items-center gap-1.5 truncate text-[16px] leading-[1.4] tracking-[-0.08px]',
                        destructive ? 'text-destructive' : 'text-foreground'
                    )}
                >
                    {title}
                </span>
                {(subtitle || subtitleIcon) && (
                    <span className="truncate text-[14px] leading-[1.4] text-description">
                        {subtitleIcon && (
                            <span className="mr-1 inline-flex align-[-2px]" data-slot="subtitle-icon">
                                {subtitleIcon}
                            </span>
                        )}
                        {subtitle}
                    </span>
                )}
            </span>
            {trailing && <span className="flex shrink-0 items-center">{trailing}</span>}
        </Root>
    );
};
