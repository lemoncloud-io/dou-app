import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconSpinner } from '@chatic/design-system-assets/icons';

const SOLID_TONE = {
    green: 'bg-primary text-primary-foreground',
    black: 'bg-foreground text-background',
    gray: 'bg-control-idle text-placeholder',
} as const;

const OUTLINE_TONE = {
    green: 'border-main-accent',
    black: 'border-foreground',
    gray: 'border-input-border',
} as const;

const SIZE = {
    xs: 'gap-1 py-1.5 pl-2 pr-[9px] text-[13px] leading-3 tracking-[-0.13px]',
    sm: 'gap-1 py-2 pl-2.5 pr-3 text-[13px]',
    md: 'h-[50px] gap-1.5 px-5 text-[14px]',
    lg: 'h-[50px] gap-1.5 px-6 text-[16px]',
} as const;

export interface ButtonSurfaceOptions {
    variant?: 'solid' | 'outline' | 'ghost';
    tone?: keyof typeof SOLID_TONE;
    size?: keyof typeof SIZE;
    fullWidth?: boolean;
}

export const buttonSurfaceClass = ({
    variant = 'solid',
    tone,
    size = 'md',
    fullWidth = false,
}: ButtonSurfaceOptions = {}): string =>
    cn(
        'inline-flex items-center justify-center rounded-full font-semibold transition-colors',
        (() => {
            const resolvedTone = tone ?? (variant === 'solid' ? 'green' : 'gray');
            if (variant === 'solid') {
                return cn(SOLID_TONE[resolvedTone], 'disabled:bg-control-idle disabled:text-placeholder');
            }
            if (variant === 'outline') {
                return cn('border text-foreground disabled:opacity-50', OUTLINE_TONE[resolvedTone]);
            }
            return 'text-foreground disabled:opacity-50';
        })(),
        SIZE[size],
        fullWidth && 'w-full'
    );

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'solid' | 'outline' | 'ghost';
    tone?: keyof typeof SOLID_TONE;
    size?: keyof typeof SIZE;
    fullWidth?: boolean;
    loading?: boolean;
    icon?: React.ReactNode;
    trailingIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            variant = 'solid',
            tone,
            size = 'md',
            fullWidth = false,
            loading = false,
            icon,
            trailingIcon,
            disabled = false,
            type = 'button',
            className,
            children,
            ...props
        },
        ref
    ) => {
        return (
            <button
                ref={ref}
                type={type}
                disabled={disabled || loading}
                className={cn(buttonSurfaceClass({ variant, tone, size, fullWidth }), className)}
                {...props}
            >
                {loading ? (
                    <IconSpinner className="size-5 animate-spin" />
                ) : (
                    <>
                        {icon}
                        {children}
                        {trailingIcon}
                    </>
                )}
            </button>
        );
    }
);
Button.displayName = 'Button';
