import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconAlert, IconCheck } from '../../resources/icons';

export interface ToastProps {
    children?: React.ReactNode;
    title?: React.ReactNode;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    variant?: 'default' | 'positive' | 'warning' | 'error';
    className?: string;
}

export const Toast = ({ children, title, description, icon, action, variant = 'default', className }: ToastProps) => {
    const leading =
        icon ??
        (variant === 'positive' ? (
            <IconCheck className="size-[22px] shrink-0 text-primary" strokeWidth={2.5} />
        ) : variant === 'warning' || variant === 'error' ? (
            <IconAlert className="size-[22px] shrink-0 text-destructive" />
        ) : null);

    return (
        <div
            role={variant === 'warning' || variant === 'error' ? 'alert' : 'status'}
            className={cn(
                'flex w-fit items-center gap-3 rounded-lg bg-toast px-4 py-3.5 text-toast-foreground shadow-[0px_4px_4px_rgba(0,0,0,0.15),0px_1px_1.5px_rgba(0,0,0,0.3)]',
                className
            )}
        >
            {leading}
            {title ? (
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <p className="text-[15px] font-semibold tracking-[-0.075px]">{title}</p>
                    {description && (
                        <p className="text-[13px] leading-[1.5] tracking-[-0.065px] text-primary">{description}</p>
                    )}
                </div>
            ) : (
                <span className="min-w-0 flex-1 text-[15px] font-semibold tracking-[-0.075px]">{children}</span>
            )}
            {action && <div className="flex shrink-0 items-center gap-3 text-[15px] font-semibold">{action}</div>}
        </div>
    );
};
