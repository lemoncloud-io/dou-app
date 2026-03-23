import * as React from 'react';

import { cn } from '@chatic/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    'flex w-full rounded-[10px] border border-input-border bg-surface p-3 text-[16px] text-foreground transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-placeholder focus-visible:border-[1.5px] focus-visible:border-focus-border focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);
Input.displayName = 'Input';

export { Input };
