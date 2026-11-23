import { type JSX, type ReactNode } from 'react';

import * as RadixDialog from '@radix-ui/react-dialog';

import { cn } from '../../utils';

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
            {modal ? (
                <RadixDialog.Overlay className="fixed inset-0 z-50 bg-[#5b5f66]/70 animate-fadeIn" />
            ) : (
                open && <div aria-hidden className="fixed inset-0 z-50 bg-[#5b5f66]/70" />
            )}
            <RadixDialog.Content
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
                    <RadixDialog.Description className="sr-only" />
                )}
                {children && <div className="mt-4">{children}</div>}
                {footer && <div className="mt-6 flex justify-end gap-3 max-sm:flex-col-reverse">{footer}</div>}
            </RadixDialog.Content>
        </RadixDialog.Portal>
    </RadixDialog.Root>
);
