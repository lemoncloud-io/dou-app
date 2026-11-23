import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import {
    Toast,
    ToastClose,
    ToastDescription,
    ToastProvider,
    ToastTitle,
    ToastViewport,
} from '@chatic/ui-kit/components/ui/toast';
import { TOAST_DURATION_MS } from '@chatic/ui-kit/components/ui/toaster';
import { setToastLimit, useToast } from '@chatic/ui-kit/components/ui/use-toast';

const ICONS = {
    default: <CheckCircle2 className="mt-px size-[18px] shrink-0 text-main-accent" aria-hidden />,
    destructive: <AlertCircle className="mt-px size-[18px] shrink-0 text-destructive" aria-hidden />,
    info: <Info className="mt-px size-[18px] shrink-0 text-toast-muted" aria-hidden />,
};

export const AppToaster = () => {
    const { t } = useTranslation();
    useEffect(() => setToastLimit(3), []);
    const { toasts } = useToast();
    const seenIds = useRef(new Set<string>());
    const [liftedIds, setLiftedIds] = useState<ReadonlySet<string>>(() => new Set());
    useEffect(() => {
        const modalOpen = document.body.style.pointerEvents === 'none';
        const live = new Set(toasts.map(toast => toast.id));
        const lifted = toasts.filter(
            toast => !seenIds.current.has(toast.id) && (toast.variant === 'destructive' || !!toast.action) && modalOpen
        );
        seenIds.current = live;
        setLiftedIds(prev => new Set([...[...prev].filter(id => live.has(id)), ...lifted.map(toast => toast.id)]));
    }, [toasts]);
    const lifts = toasts.some(toast => toast.open !== false && liftedIds.has(toast.id));

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
                    duration={props.duration ?? (variant === 'destructive' ? Infinity : undefined)}
                >
                    {ICONS[variant ?? 'default']}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {title && <ToastTitle className="text-callout tracking-normal">{title}</ToastTitle>}
                        {description && (
                            <ToastDescription
                                className={cn(
                                    variant === 'destructive' ? 'line-clamp-4' : 'line-clamp-2',
                                    'text-caption tracking-normal first:text-callout first:text-toast-foreground'
                                )}
                            >
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
            <ToastViewport
                className={cn('absolute top-3', lifts ? 'z-alert' : 'z-toast')}
                label={t('common.toastRegion')}
            />
        </ToastProvider>
    );
};
