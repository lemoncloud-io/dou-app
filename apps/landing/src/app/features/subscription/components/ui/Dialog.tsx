import { type JSX, type ReactNode } from 'react';

import * as RadixDialog from '@radix-ui/react-dialog';

import { cn } from '../../utils';

/**
 * A centred modal on Radix's dialog — focus trap, Escape and the overlay click come from it. The
 * footer holds the buttons, right-aligned, primary last.
 *
 * `modal={false}` lets the rest of the page take clicks and focus while the dialog stays drawn the same,
 * backdrop included — for a dialog whose content opens something of its own over the page (a card
 * issuer's check), which a modal dialog would leave unclickable. Fix it for the dialog's life: Radix
 * mounts different content for the two, so switching it remounts what is inside.
 */
export const Dialog = ({
    open,
    onOpenChange,
    title,
    description,
    children,
    footer,
    className,
    modal = true,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
    className?: string;
    modal?: boolean;
}): JSX.Element => (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
        <RadixDialog.Portal>
            {/* Radix draws no overlay for a dialog that is not modal; the same backdrop stands in for it. */}
            {modal ? (
                <RadixDialog.Overlay className="fixed inset-0 z-50 bg-[#5b5f66]/70 animate-fadeIn" />
            ) : (
                open && <div aria-hidden className="fixed inset-0 z-50 bg-[#5b5f66]/70" />
            )}
            <RadixDialog.Content
                // Without a focus trap, focus leaving the dialog is not a reason to close it.
                onFocusOutside={modal ? undefined : event => event.preventDefault()}
                className={cn(
                    'fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2',
                    'rounded-2xl border border-line bg-white p-6 animate-scaleIn focus:outline-none sm:p-8',
                    className
                )}
            >
                <RadixDialog.Title className="text-xl font-bold leading-[1.4] text-ink">{title}</RadixDialog.Title>
                {description ? (
                    <RadixDialog.Description className="mt-2 text-sm font-medium leading-[1.5] text-[#666b78]">
                        {description}
                    </RadixDialog.Description>
                ) : (
                    // Radix warns when a dialog has no description; an empty one says there is none.
                    <RadixDialog.Description className="sr-only" />
                )}
                {children && <div className="mt-4">{children}</div>}
                {footer && <div className="mt-6 flex justify-end gap-3 max-sm:flex-col-reverse">{footer}</div>}
            </RadixDialog.Content>
        </RadixDialog.Portal>
    </RadixDialog.Root>
);
