import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { Button, type ButtonProps } from './Button';
import { FLOATING_PANEL } from './floatingPanel';

export interface FloatingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Button label (e.g. "완료"). */
    label: string;
    /** Solid tone — green (default) or black. */
    tone?: Extract<ButtonProps['tone'], 'green' | 'black'>;
    /** Shows a spinner and blocks interaction while an action is in flight. */
    loading?: boolean;
    /** Optional sub-action rendered below the button (e.g. a TextLink). */
    link?: React.ReactNode;
    /** className applied to the outer floating panel, not the button. */
    wrapperClassName?: string;
}

/**
 * Bottom floating call-to-action preset — the Figma "Solid button": a full-width
 * solid Button on a white panel with an upward shadow, plus an optional sub-link
 * below. Enabled = tone fill / dark or white text; disabled|loading = gray fill.
 */
export const FloatingButton = React.forwardRef<HTMLButtonElement, FloatingButtonProps>(
    ({ label, tone = 'green', loading = false, link, className, wrapperClassName, ...props }, ref) => {
        return (
            <div className={cn(FLOATING_PANEL, 'flex flex-col items-center gap-4', wrapperClassName)}>
                <Button
                    ref={ref}
                    variant="solid"
                    tone={tone}
                    size="lg"
                    fullWidth
                    loading={loading}
                    className={className}
                    {...props}
                >
                    {label}
                </Button>
                {link}
            </div>
        );
    }
);
FloatingButton.displayName = 'FloatingButton';
