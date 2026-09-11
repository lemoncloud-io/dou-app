import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ElementRef, ReactElement, ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@chatic/ui-kit/components/ui/tooltip';

interface HintProps extends Omit<ComponentPropsWithoutRef<typeof TooltipTrigger>, 'asChild' | 'children'> {
    label: ReactNode;
    /** The one element the hint describes — it becomes the tooltip trigger. */
    children: ReactElement;
    side?: 'top' | 'right' | 'bottom' | 'left';
    /** Overrides the app-wide delay (`TooltipProvider` in DesktopRuntime). */
    delayDuration?: number;
}

/**
 * Hover/focus hint for a control — use this instead of the native `title` attribute,
 * which the browser delays by a second or more (the timer restarts on every mouse
 * move) and styles on its own terms. Keep the control's `aria-label`; assistive tech
 * reads that, not the hint.
 *
 * Forwards ref and trigger props, so it can sit under another `asChild` trigger
 * (`<DropdownMenuTrigger asChild><Hint label=…><button/></Hint></DropdownMenuTrigger>`).
 */
export const Hint = forwardRef<ElementRef<typeof TooltipTrigger>, HintProps>(
    ({ label, children, side = 'top', delayDuration, ...triggerProps }, ref) => (
        <Tooltip delayDuration={delayDuration}>
            <TooltipTrigger ref={ref} asChild {...triggerProps}>
                {children}
            </TooltipTrigger>
            <TooltipContent side={side} className="max-w-xs whitespace-pre-line break-words">
                {label}
            </TooltipContent>
        </Tooltip>
    )
);
Hint.displayName = 'Hint';
