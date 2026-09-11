import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface SheetActionProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> {
    /** Leading glyph, sized by the caller — the design draws these at 26px. */
    icon?: React.ReactNode;
    /** Action label. */
    label: string;
}

/**
 * An action row in a bottom sheet: a leading glyph and a label (Figma "채팅 리스트" as the
 * action sheet uses it, 4712:16445).
 *
 * The sibling of `SheetOption`, not a variant of it — that one is a single-select radio row
 * for choosing among values, this one performs something and closes. They look alike and
 * behave nothing alike, which is why the roles (`radio` vs. a plain button) differ.
 *
 * No divider between rows: the design separates them by rhythm alone, and a rule between two
 * items reads as a group boundary where there is none.
 */
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
