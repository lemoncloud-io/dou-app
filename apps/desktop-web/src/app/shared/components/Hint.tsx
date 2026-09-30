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
    ({ label, children, side = 'top', delayDuration, onFocus, ...triggerProps }, ref) => (
        <Tooltip delayDuration={delayDuration}>
            <TooltipTrigger
                ref={ref}
                asChild
                {...triggerProps}
                // Focus that came from no element on the page is a hand-back, not someone
                // arriving: a dialog or menu returning focus to its opener once it has gone, or
                // the window being focused again. The hint opened on it and stayed up over the
                // control just used ("Search messages" after the search closed). Tab always
                // comes from an element, so keyboard users still get the hint.
                onFocus={event => {
                    onFocus?.(event);
                    // Radix skips its own open when the composed handler prevented the event.
                    if (!event.relatedTarget) event.preventDefault();
                }}
            >
                {children}
            </TooltipTrigger>
            {/* Ink, not the kit's lime: a hint on every icon button spent the accent on
                decoration, and lime says "primary action", which a hint is not. */}
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
