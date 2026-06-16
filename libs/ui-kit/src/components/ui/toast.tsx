import * as React from 'react';

import * as ToastPrimitives from '@radix-ui/react-toast';
import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '../../utils';

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
    React.ElementRef<typeof ToastPrimitives.Viewport>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
    <ToastPrimitives.Viewport
        ref={ref}
        className={cn(
            'pointer-events-none fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse items-center gap-2 p-4 pt-safe-top',
            className
        )}
        {...props}
    />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
    'group pointer-events-auto relative flex w-full max-w-md items-start gap-3 overflow-hidden rounded-xl border-l-[3px] bg-toast px-4 py-3.5 text-toast-foreground shadow-[0_8px_28px_-8px_rgba(0,0,0,0.4),0_2px_8px_-3px_rgba(0,0,0,0.25)] ring-1 ring-white/5 transition-all data-[swipe=cancel]:translate-y-0 data-[swipe=end]:translate-y-[var(--radix-toast-swipe-end-y)] data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)] data-[swipe=move]:transition-none data-[state=open]:animate-fade-in data-[state=open]:animate-slide-in-from-top data-[state=closed]:animate-fade-out data-[state=closed]:animate-slide-out-to-top',
    {
        variants: {
            variant: {
                default: 'border-l-main-accent',
                destructive: 'border-l-destructive',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

const Toast = React.forwardRef<
    React.ElementRef<typeof ToastPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
    return <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />;
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
    React.ElementRef<typeof ToastPrimitives.Action>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
    <ToastPrimitives.Action
        ref={ref}
        className={cn('shrink-0 text-[15px] font-semibold tracking-[-0.3px] text-toast-foreground', className)}
        {...props}
    />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
    React.ElementRef<typeof ToastPrimitives.Close>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
    <ToastPrimitives.Close
        ref={ref}
        className={cn('shrink-0 text-[15px] font-semibold tracking-[-0.3px] text-[red]', className)}
        toast-close=""
        {...props}
    />
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
    React.ElementRef<typeof ToastPrimitives.Title>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
    <ToastPrimitives.Title
        ref={ref}
        className={cn('text-[15px] font-semibold tracking-[-0.075px] text-toast-foreground', className)}
        {...props}
    />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
    React.ElementRef<typeof ToastPrimitives.Description>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
    <ToastPrimitives.Description
        ref={ref}
        className={cn('text-[13px] leading-[1.5] tracking-[-0.065px] text-toast-muted', className)}
        {...props}
    />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
    type ToastProps,
    type ToastActionElement,
    ToastProvider,
    ToastViewport,
    Toast,
    ToastTitle,
    ToastDescription,
    ToastClose,
    ToastAction,
};
