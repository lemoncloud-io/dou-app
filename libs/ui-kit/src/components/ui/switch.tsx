import * as React from 'react';

import * as SwitchPrimitives from '@radix-ui/react-switch';

import { cn } from '@chatic/lib/utils';

const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
    // Both states are held to the 3:1 a control's state needs (WCAG 1.4.11). The generator's
    // pair — a pale `input` track off, the `primary` fill on, a `background` thumb on both —
    // drew a light switch that barely separated from its ground. Off, the track takes the
    // host's `control-border`; on, the fill keeps the accent but gains a `primary-ink` edge
    // and an ink thumb, so neither the boundary nor the state rests on the fill alone.
    <SwitchPrimitives.Root
        className={cn(
            'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary-ink data-[state=checked]:bg-primary data-[state=unchecked]:bg-control-border',
            className
        )}
        {...props}
        ref={ref}
    >
        <SwitchPrimitives.Thumb
            className={cn(
                'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0'
            )}
        />
    </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
