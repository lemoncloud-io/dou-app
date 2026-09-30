import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './toast';
import { useToast } from './use-toast';

/**
 * How long a toast stays. 1.5s was under the time it takes to read one sentence, so a
 * confirmation ("Channel created", or "Member removed" with its Undo) was gone before
 * anyone could act on it, or even notice it had fired. A swipe still dismisses it early.
 * An error has no timer at all (see `toast` in use-toast.ts) and carries a close button.
 */
export const TOAST_DURATION_MS = 5000;

interface ToasterProps {
    /** Extra classes for the viewport, e.g. to keep toasts clear of an app header. */
    viewportClassName?: string;
    /** Accessible name of an error toast's close button. The kit has no strings of its own. */
    closeLabel?: string;
}

const ICONS = {
    default: <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-main-accent" aria-hidden />,
    destructive: <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />,
    // A notice that is neither a success nor a failure ("that message is not
    // loaded") must not wear the success check.
    info: <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />,
};

export const Toaster = ({ viewportClassName, closeLabel = 'Close' }: ToasterProps) => {
    const { toasts } = useToast();

    return (
        <ToastProvider duration={TOAST_DURATION_MS} swipeDirection="up">
            {toasts.map(({ id, title, description, action, variant, ...props }) => {
                return (
                    <Toast key={id} variant={variant} {...props}>
                        {ICONS[variant ?? 'default']}
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            {title && <ToastTitle>{title}</ToastTitle>}
                            {description && <ToastDescription>{description}</ToastDescription>}
                        </div>
                        {action}
                        {variant === 'destructive' && (
                            <ToastClose
                                aria-label={closeLabel}
                                className="-mr-1 rounded-sm p-0.5 text-toast-muted transition-colors hover:text-toast-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <X className="size-4" aria-hidden />
                            </ToastClose>
                        )}
                    </Toast>
                );
            })}
            <ToastViewport className={viewportClassName} />
        </ToastProvider>
    );
};
