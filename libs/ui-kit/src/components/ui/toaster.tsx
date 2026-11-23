import { type CSSProperties, useLayoutEffect, useRef } from 'react';
import { AlertCircle, Check, Info } from 'lucide-react';

import { cn } from '../../utils';
import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './toast';
import { useToast } from './use-toast';

export const TOAST_DURATION_MS = 3000;

export const TOAST_MIN_LIFT_PX = 80;

export const SNACKBAR_OFFSET = `calc(max(var(--safe-bottom, 0px), var(--keyboard-height, 0px)) + max(var(--toast-lift, 0px), ${TOAST_MIN_LIFT_PX}px) + 16px)`;

const lifts = new Map<symbol, number>();

const publishLift = () => {
    const tallest = Math.max(0, ...lifts.values());
    const root = document.documentElement;
    if (tallest > 0) root.style.setProperty('--toast-lift', `${tallest}px`);
    else root.style.removeProperty('--toast-lift');
};

export const useToastLift = (px: number | null) => {
    const owner = useRef<symbol | null>(null);
    owner.current ??= Symbol('toast-lift');

    useLayoutEffect(() => {
        if (!px || px <= 0) return;
        const key = owner.current as symbol;
        lifts.set(key, px);
        publishLift();
        return () => {
            lifts.delete(key);
            publishLift();
        };
    }, [px]);
};

const VIEWPORT_STYLE = {
    '--snackbar-offset': SNACKBAR_OFFSET,
    paddingBottom: 'var(--snackbar-offset)',
} as CSSProperties;

interface ToasterProps {
    viewportClassName?: string;
    label: string;
}

const ICONS = {
    default: <Check className="size-[22px] shrink-0 text-primary" strokeWidth={2.5} aria-hidden />,
    destructive: <AlertCircle className="size-[22px] shrink-0 text-destructive" aria-hidden />,
    info: <Info className="size-[22px] shrink-0 text-toast-muted" aria-hidden />,
};

export const Toaster = ({ viewportClassName, label }: ToasterProps) => {
    const { toasts } = useToast();

    return (
        <ToastProvider duration={TOAST_DURATION_MS} swipeDirection="down">
            {toasts.map(({ id, title, description, action, variant, className, ...props }) => {
                return (
                    <Toast
                        key={id}
                        variant={variant}
                        className={cn(
                            'touch-none items-center gap-[9px] rounded-[8px] border-l-0 px-4 py-[13px]',
                            'shadow-[0px_4px_4px_rgba(0,0,0,0.15),0px_1px_1.5px_rgba(0,0,0,0.3)]',
                            'data-[state=open]:animate-snackbar-in data-[state=closed]:animate-snackbar-out',
                            'motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none',
                            className
                        )}
                        {...props}
                    >
                        {ICONS[variant ?? 'default']}
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            {title && <ToastTitle className="leading-normal">{title}</ToastTitle>}
                            {description && <ToastDescription>{description}</ToastDescription>}
                        </div>
                        {action}
                    </Toast>
                );
            })}
            <ToastViewport
                className={cn(
                    'bottom-0 top-auto transition-[padding-bottom] duration-200 motion-reduce:transition-none',
                    viewportClassName
                )}
                style={VIEWPORT_STYLE}
                label={label}
            />
        </ToastProvider>
    );
};
