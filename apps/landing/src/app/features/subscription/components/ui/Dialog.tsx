import { type JSX, type ReactNode } from 'react';

import * as RadixDialog from '@radix-ui/react-dialog';

import { cn } from '../../utils';

/**
 * A centred modal on Radix's dialog — focus trap, Escape and the overlay click come from it. The
 * footer holds the buttons, right-aligned, primary last.
 */
export const Dialog = ({
    open,
    onOpenChange,
    title,
    description,
    children,
    footer,
    className,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
    className?: string;
}): JSX.Element => (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
        <RadixDialog.Portal>
            <RadixDialog.Overlay className="fixed inset-0 z-50 bg-navy/40 animate-fadeIn" />
            <RadixDialog.Content
                className={cn(
                    'fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2',
                    'rounded-2xl bg-card p-6 shadow-xl animate-scaleIn focus:outline-none',
                    className
                )}
            >
                <RadixDialog.Title className="text-lg font-semibold text-navy">{title}</RadixDialog.Title>
                {description ? (
                    <RadixDialog.Description className="mt-2 text-sm text-subtitle">
                        {description}
                    </RadixDialog.Description>
                ) : (
                    // Radix warns when a dialog has no description; an empty one says there is none.
                    <RadixDialog.Description className="sr-only" />
                )}
                {children && <div className="mt-4">{children}</div>}
                {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
            </RadixDialog.Content>
        </RadixDialog.Portal>
    </RadixDialog.Root>
);
