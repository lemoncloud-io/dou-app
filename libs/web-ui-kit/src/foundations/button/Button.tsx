import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconSpinner } from '../../resources/icons';

// Color tones from the design guide's button system.
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
    sm: 'gap-1 py-2.5 pl-2.5 pr-3 text-[13px]',
    md: 'h-[50px] gap-1.5 px-5 text-[14px]',
    lg: 'h-[50px] gap-1.5 px-6 text-[16px]',
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Fill style. `solid` = filled CTA, `outline` = bordered, `ghost` = text-only. */
    variant?: 'solid' | 'outline' | 'ghost';
    /** Color tone (design-guide): green / black / gray. */
    tone?: keyof typeof SOLID_TONE;
    /** @deprecated use `tone="green"` — kept for back-compat (green outline). */
    accent?: boolean;
    size?: keyof typeof SIZE;
    fullWidth?: boolean;
    /** Shows a spinner and blocks interaction. */
    loading?: boolean;
    icon?: React.ReactNode;
    trailingIcon?: React.ReactNode;
}

/**
 * Base pill button — the foundation for the design guide's button system. Solid
 * (green/black), outline (green/black/gray) and ghost variants, with sizes and
 * optional leading/trailing icons + loading. Presets (FloatingButton,
 * OutlineButton, SubscriptionButton) extend this. Stateless.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            variant = 'solid',
            tone,
            accent = false,
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
        // Resolve tone: explicit `tone` wins; `accent` maps to green; otherwise
        // solid defaults to green, outline/ghost to gray (neutral).
        const resolvedTone = tone ?? (accent ? 'green' : variant === 'solid' ? 'green' : 'gray');

        return (
            <button
                ref={ref}
                type={type}
                disabled={disabled || loading}
                className={cn(
                    'inline-flex items-center justify-center rounded-full font-semibold transition-colors',
                    variant === 'solid' &&
                        cn(SOLID_TONE[resolvedTone], 'disabled:bg-control-idle disabled:text-placeholder'),
                    variant === 'outline' &&
                        cn('border text-foreground disabled:opacity-50', OUTLINE_TONE[resolvedTone]),
                    variant === 'ghost' && 'text-foreground disabled:opacity-50',
                    SIZE[size],
                    fullWidth && 'w-full',
                    className
                )}
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
