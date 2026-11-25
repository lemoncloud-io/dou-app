import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ElementRef, ReactElement, ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@chatic/ui-kit';

interface HintProps extends Omit<ComponentPropsWithoutRef<typeof TooltipTrigger>, 'asChild' | 'children'> {
    label: ReactNode;
    children: ReactElement;
    side?: 'top' | 'right' | 'bottom' | 'left';
    delayDuration?: number;
}

export const Hint = forwardRef<ElementRef<typeof TooltipTrigger>, HintProps>(
    ({ label, children, side = 'top', delayDuration, onFocus, ...triggerProps }, ref) => (
        <Tooltip delayDuration={delayDuration}>
            <TooltipTrigger
                ref={ref}
                asChild
                {...triggerProps}
                onFocus={event => {
                    onFocus?.(event);
                    if (!event.relatedTarget) event.preventDefault();
                }}
            >
                {children}
            </TooltipTrigger>
            <TooltipContent
                side={side}
                className="max-w-xs whitespace-pre-line break-words bg-foreground text-caption text-background"
            >
                {label}
            </TooltipContent>
        </Tooltip>
    )
);
Hint.displayName = 'Hint';
