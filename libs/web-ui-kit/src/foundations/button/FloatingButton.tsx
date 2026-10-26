import * as React from 'react';

import { cn } from '@chatic/lib/utils';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

import { Button, type ButtonProps } from './Button';
import { FLOATING_PANEL } from './floatingPanel';

export interface FloatingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Button label (e.g. "Done"). */
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
 *
 * The panel lifts the app's bottom snackbar by its own height while it is mounted, so a toast its
 * press raises (a failed verify, say, that turns the button into "retry") lands above the button
 * instead of on it. Measured rather than fixed: a `link` under the button makes the panel taller.
 */
export const FloatingButton = React.forwardRef<HTMLButtonElement, FloatingButtonProps>(
    ({ label, tone = 'green', loading = false, link, className, wrapperClassName, ...props }, ref) => {
        const panelRef = React.useRef<HTMLDivElement>(null);
        const [panelHeight, setPanelHeight] = React.useState<number | null>(null);
        React.useLayoutEffect(() => {
            const panel = panelRef.current;
            if (!panel) return;
            const measure = () => setPanelHeight(Math.ceil(panel.getBoundingClientRect().height));
            measure();
            if (typeof ResizeObserver === 'undefined') return;
            const observer = new ResizeObserver(measure);
            observer.observe(panel);
            return () => observer.disconnect();
        }, []);
        useToastLift(panelHeight);

        return (
            <div ref={panelRef} className={cn(FLOATING_PANEL, 'flex flex-col items-center gap-4', wrapperClassName)}>
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
