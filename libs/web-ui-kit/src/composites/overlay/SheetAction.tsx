import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface SheetActionProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> {
    icon?: React.ReactNode;
    label: string;
}

export const SheetAction = React.forwardRef<HTMLButtonElement, SheetActionProps>(
    ({ icon, label, className, ...props }, ref) => (
        <button
            ref={ref}
            type="button"
            className={cn(
                'flex w-full items-center gap-2.5 px-5 py-2.5 text-left transition-colors active:bg-accent disabled:opacity-50',
                className
            )}
            {...props}
        >
            {icon && (
                <span className="flex size-[26px] shrink-0 items-center justify-center text-foreground">{icon}</span>
            )}
            <span className="min-w-0 flex-1 truncate text-base font-medium leading-[18px] tracking-[-0.08px] text-foreground">
                {label}
            </span>
        </button>
    )
);
SheetAction.displayName = 'SheetAction';
