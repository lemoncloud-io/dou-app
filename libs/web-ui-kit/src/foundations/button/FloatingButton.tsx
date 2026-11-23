import * as React from 'react';

import { cn } from '@chatic/ui-kit';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

import { Button, type ButtonProps } from './Button';
import { FLOATING_PANEL } from './floatingPanel';

export interface FloatingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
    tone?: Extract<ButtonProps['tone'], 'green' | 'black'>;
    loading?: boolean;
    link?: React.ReactNode;
    wrapperClassName?: string;
}

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
