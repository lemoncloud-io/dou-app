import { AlertCircle, CheckCircle2 } from 'lucide-react';

import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './toast';
import { useToast } from './use-toast';

export const Toaster = () => {
    const { toasts } = useToast();

    return (
        <ToastProvider duration={1500} swipeDirection="up">
            {toasts.map(({ id, title, description, action, variant, ...props }) => {
                const isError = variant === 'destructive';
                return (
                    <Toast key={id} variant={variant} {...props}>
                        {isError ? (
                            <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
                        ) : (
                            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-main-accent" aria-hidden />
                        )}
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            {title && <ToastTitle>{title}</ToastTitle>}
                            {description && <ToastDescription>{description}</ToastDescription>}
                        </div>
                        {action}
                    </Toast>
                );
            })}
            <ToastViewport />
        </ToastProvider>
    );
};
