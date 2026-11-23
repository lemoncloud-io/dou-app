import * as React from 'react';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

import { useOpenerFocus } from '../../utils/openerFocus';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
            'fixed inset-0 z-50 bg-overlay/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            className
        )}
        {...props}
    />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const APP_WIDTH_CAP = 'max-w-[var(--app-width,100%)] mx-auto';

export const VIEWPORT_HEIGHT_CAP = 'max-h-[calc(100dvh-2rem-var(--keyboard-height,0px))] overflow-y-auto';

export const CENTRE_ABOVE_KEYBOARD = 'top-[calc(50%-var(--keyboard-height,0px)/2)]';

const dialogVariants = {
    default: `${VIEWPORT_HEIGHT_CAP} ${CENTRE_ABOVE_KEYBOARD} p-6 left-[50%] w-full [--dialog-width:min(311px,calc(100%_-_48px),var(--app-width))] max-w-[var(--dialog-width,min(32rem,100%))] translate-x-[-50%] translate-y-[-50%] border rounded-lg data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg`,
    fullscreen: `inset-0 ${APP_WIDTH_CAP} pt-safe-top pb-safe-bottom pl-safe-left pr-safe-right w-full border-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]`,
    bare: '',
    'slide-up': `inset-0 ${APP_WIDTH_CAP} pt-safe-top pb-safe-bottom pl-safe-left pr-safe-right w-full border-0 data-[state=closed]:slide-out-to-bottom-full data-[state=open]:slide-in-from-bottom-full data-[state=open]:fade-in-100 data-[state=closed]:fade-out-100 data-[state=open]:duration-500 data-[state=closed]:duration-300 [animation-timing-function:cubic-bezier(0.32,0.72,0,1)]`,
};

export type CloseButtonProps = { hideClose: true; closeLabel?: string } | { hideClose?: false; closeLabel: string };

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> &
        CloseButtonProps & {
            variant?: keyof typeof dialogVariants;
            overlayClassName?: string;
        }
>(
    (
        {
            className,
            children,
            hideClose,
            closeLabel,
            variant = 'default',
            overlayClassName,
            onCloseAutoFocus,
            ...props
        },
        ref
    ) => {
        const { Capture, withReturn } = useOpenerFocus();
        return (
            <DialogPortal>
                <DialogOverlay className={overlayClassName} />
                <DialogPrimitive.Content
                    ref={ref}
                    onCloseAutoFocus={withReturn(onCloseAutoFocus)}
                    className={cn(
                        'fixed z-50 grid grid-cols-[minmax(0,1fr)] gap-4 bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                        dialogVariants[variant],
                        className
                    )}
                    {...props}
                >
                    <Capture />
                    {children}
                    {!hideClose && (
                        <DialogPrimitive.Close className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                            <X className="h-4 w-4" />
                            <span className="sr-only">{closeLabel}</span>
                        </DialogPrimitive.Close>
                    )}
                </DialogPrimitive.Content>
            </DialogPortal>
        );
    }
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn('text-lg font-semibold leading-none tracking-tight', className)}
        {...props}
    />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
    Dialog,
    DialogPortal,
    DialogOverlay,
    DialogTrigger,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
};
