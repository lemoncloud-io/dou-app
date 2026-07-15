import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { Button } from './Button';
import { FLOATING_PANEL } from './floatingPanel';

export interface InlineActionButtonProps {
    /** Emphasized amount (e.g. "₩8,600"). */
    amount: React.ReactNode;
    /** Optional struck-through original amount. */
    originalAmount?: React.ReactNode;
    /** Action label. */
    label: string;
    /** Click handler — receives the native event, like the other button presets. */
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
    /** className applied to the action button (not the panel). */
    className?: string;
    /** className for the outer floating panel. */
    wrapperClassName?: string;
}

/**
 * Inline action button — the design guide's payment CTA: a floating panel with a
 * price (optional struck-through original + emphasized amount) on the left and a
 * fixed-width black Button on the right. Used only for payment situations.
 */
export const InlineActionButton = React.forwardRef<HTMLButtonElement, InlineActionButtonProps>(
    ({ amount, originalAmount, label, onClick, disabled = false, className, wrapperClassName }, ref) => {
        return (
            <div className={cn(FLOATING_PANEL, wrapperClassName)}>
                <div className="flex w-full items-center">
                    <div className="flex flex-1 items-center gap-1.5">
                        {originalAmount && (
                            <span className="text-[20px] font-medium text-muted-foreground line-through">
                                {originalAmount}
                            </span>
                        )}
                        <span className="text-[24px] font-semibold text-foreground">{amount}</span>
                    </div>
                    <Button
                        ref={ref}
                        tone="black"
                        size="lg"
                        onClick={onClick}
                        disabled={disabled}
                        className={cn('w-[132px]', className)}
                    >
                        {label}
                    </Button>
                </div>
            </div>
        );
    }
);
InlineActionButton.displayName = 'InlineActionButton';
