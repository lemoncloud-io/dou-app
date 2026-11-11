import { type ButtonHTMLAttributes, type JSX, forwardRef } from 'react';

import { cn } from '../../utils';

export type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg' | 'sm';

const VARIANTS: Record<ButtonVariant, string> = {
    primary: 'bg-main-green text-navy hover:opacity-90',
    secondary: 'bg-white text-ink border-[1.5px] border-[#d9dbe0] hover:bg-muted',
    dark: 'bg-navy text-white hover:opacity-90',
    ghost: 'bg-transparent text-subtitle hover:text-navy hover:bg-muted',
    danger: 'bg-status-danger text-white hover:opacity-90',
};

const SIZES: Record<ButtonSize, string> = {
    sm: 'h-8 px-3.5 text-[13px] rounded-full',
    md: 'h-10 px-5 text-sm rounded-full',
    lg: 'h-[46px] px-7 text-[15px] rounded-full',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
}

/** The one button the subscription pages use. Landing tokens only — no UI kit. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = 'primary', size = 'md', className, type = 'button', ...props }, ref): JSX.Element => (
        <button
            ref={ref}
            type={type}
            className={cn(
                'inline-flex items-center justify-center gap-2 font-semibold transition-all',
                'disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40',
                VARIANTS[variant],
                SIZES[size],
                className
            )}
            {...props}
        />
    )
);
Button.displayName = 'Button';
