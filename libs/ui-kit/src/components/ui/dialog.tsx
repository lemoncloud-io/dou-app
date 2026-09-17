import * as React from 'react';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

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
            'fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            className
        )}
        {...props}
    />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Every variant caps at `--app-width` — the host app's own width, set by a phone-class app such
 * as `apps/web` and absent in a desktop host, where the `100%` fallback leaves the variant exactly
 * as it was. A dialog is `fixed` and portalled to `document.body`, so it escapes whatever column
 * the app shell centres its screens in; without a cap of its own, a full-screen dialog opened from
 * a narrow-column app spans a 1440px browser while the screen behind it does not.
 *
 * `default` is the notice-shaped dialog and does NOT follow the column: a card that grew to a
 * 768px phone-class column would be a banner. It takes one width instead — `--dialog-width`,
 * declared on the variant so no call site carries a number — which is a design width with a floor
 * guard, `min(311px, 100% - 48px)`: 311 on anything roomy, and 24px of breathing room either side
 * once the device is narrower than that. The third `min()` term is what scopes the rule: it reads
 * `--app-width` with no fallback, so in a host that declares no app width the whole declaration is
 * invalid, `--dialog-width` never resolves, and `max-width` falls back to the original 32rem. A
 * desktop host is untouched by construction, not by remembering to check.
 *
 * The two full-bleed variants pair `inset-0` with `mx-auto`: over-constrained horizontally with
 * auto margins, the panel centres on the same axis as the shell.
 */
const APP_WIDTH_CAP = 'max-w-[var(--app-width,100%)] mx-auto';

const dialogVariants = {
    default:
        'p-6 left-[50%] top-[50%] w-full [--dialog-width:min(311px,calc(100%_-_48px),var(--app-width))] max-w-[var(--dialog-width,min(32rem,100%))] translate-x-[-50%] translate-y-[-50%] border rounded-lg data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
    fullscreen: `inset-0 ${APP_WIDTH_CAP} pt-safe-top pb-safe-bottom pl-safe-left pr-safe-right w-full border-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]`,
    /** No placement or entrance of its own — the caller's `className` positions the panel. */
    bare: '',
    'slide-up': `inset-0 ${APP_WIDTH_CAP} pt-safe-top pb-safe-bottom pl-safe-left pr-safe-right w-full border-0 data-[state=closed]:slide-out-to-bottom-full data-[state=open]:slide-in-from-bottom-full duration-500 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] [--tw-enter-duration:5000ms] [--tw-exit-duration:5000ms]`,
};

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
        hideClose?: boolean;
        variant?: keyof typeof dialogVariants;
        /** Restyles the backdrop (e.g. a frosted one) without leaving the kit's portal/overlay pairing. */
        overlayClassName?: string;
    }
>(({ className, children, hideClose, variant = 'default', overlayClassName, ...props }, ref) => (
    <DialogPortal>
        <DialogOverlay className={overlayClassName} />
        <DialogPrimitive.Content
            ref={ref}
            className={cn(
                'fixed z-50 grid gap-4 bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                dialogVariants[variant],
                className
            )}
            {...props}
        >
            {children}
            {!hideClose && (
                <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
            )}
        </DialogPrimitive.Content>
    </DialogPortal>
));
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
