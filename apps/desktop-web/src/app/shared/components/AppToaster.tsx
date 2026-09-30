import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import {
    Toast,
    ToastClose,
    ToastDescription,
    ToastProvider,
    ToastTitle,
    ToastViewport,
} from '@chatic/ui-kit/components/ui/toast';
import { TOAST_DURATION_MS } from '@chatic/ui-kit/components/ui/toaster';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

// The icon alone carries the tone. The kit's 3px accent bar is dropped: under a 16px radius
// it clipped into a curved sliver down the left edge instead of reading as a bar.
const ICONS = {
    default: <CheckCircle2 className="mt-px size-[18px] shrink-0 text-main-accent" aria-hidden />,
    destructive: <AlertCircle className="mt-px size-[18px] shrink-0 text-destructive" aria-hidden />,
    info: <Info className="mt-px size-[18px] shrink-0 text-toast-muted" aria-hidden />,
};

/**
 * The desktop shell's toaster. It reuses the kit's toast primitives and store but not its
 * layout, which `apps/web` keeps: on desktop a toast is a compact capsule sized to its
 * text, where the kit's is a fixed 448px slab — most toasts here are one short line.
 *
 * The toast floats 12px from the top of the app area, over the middle of the 56px pane
 * header, which is empty: the title sits at the left and the actions at the right. Mount
 * it inside the element that starts right under the banners, so the viewport is positioned
 * against that element and a connection or update banner pushes toasts down with the
 * header instead of covering them.
 *
 * An error toast has no timer (the kit store sets that), so it carries the close button.
 */
export const AppToaster = () => {
    const { t } = useTranslation();
    const { toasts } = useToast();

    return (
        <ToastProvider duration={TOAST_DURATION_MS} swipeDirection="up">
            {toasts.map(({ id, title, description, action, variant, className, ...props }) => (
                <Toast
                    key={id}
                    variant={variant}
                    className={cn(
                        'w-auto min-w-64 max-w-[26rem] items-start gap-2.5 rounded-2xl border-l-0 px-3.5 py-2.5 ring-toast-foreground/10',
                        'shadow-[0_2px_6px_-2px_hsl(var(--shadow-color)/0.2),0_14px_32px_-12px_hsl(var(--shadow-color)/0.45)]',
                        'data-[state=closed]:animate-toast-out data-[state=open]:animate-toast-in motion-reduce:animate-none',
                        className
                    )}
                    {...props}
                >
                    {ICONS[variant ?? 'default']}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {title && <ToastTitle className="text-callout tracking-normal">{title}</ToastTitle>}
                        {description && (
                            // Alone, the description is the whole message, so it takes the
                            // title's weight of colour; under a title it stays secondary.
                            <ToastDescription className="line-clamp-2 text-caption tracking-normal first:text-callout first:text-toast-foreground">
                                {description}
                            </ToastDescription>
                        )}
                    </div>
                    {action}
                    {variant === 'destructive' && (
                        <ToastClose
                            aria-label={t('common.close')}
                            className="focus-ring -mr-1 rounded-sm p-0.5 text-toast-muted transition-colors hover:text-toast-foreground"
                        >
                            <X className="size-4" aria-hidden />
                        </ToastClose>
                    )}
                </Toast>
            ))}
            {/* The gap lives in `top`, not in padding: the kit's `pt-safe-top` outranks any
                `pt-*` passed here, and on desktop it resolves to 0. */}
            {/* Radix names the region in English unless told; `{hotkey}` is its own placeholder. */}
            <ToastViewport className="absolute top-3" label={t('common.toastRegion')} />
        </ToastProvider>
    );
};
