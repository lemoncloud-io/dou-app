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
    // 28px-tall in-menu pill (Figma 구독 상태 뱃지 `4135:24750`) — the tier badge that sits inside a
    // dropdown row, where the `sm` control would tower over 14px menu text.
    xs: 'gap-1 py-1.5 pl-2 pr-[9px] text-[13px] leading-3 tracking-[-0.13px]',
    // 32px-tall pill — the design system's badge size, and the one the subscription tier pill uses
    // (Figma 구독 상태 뱃지 `3486:25567` / `3769:34789`: gap 4, pl 10, pr 12, py 8, 16px glyph).
    sm: 'gap-1 py-2 pl-2.5 pr-3 text-[13px]',
    md: 'h-[50px] gap-1.5 px-5 text-[14px]',
    lg: 'h-[50px] gap-1.5 px-6 text-[16px]',
} as const;

export interface ButtonSurfaceOptions {
    variant?: 'solid' | 'outline' | 'ghost';
    tone?: keyof typeof SOLID_TONE;
    accent?: boolean;
    size?: keyof typeof SIZE;
    fullWidth?: boolean;
}

/**
 * The button system's SURFACE classes — pill shape, tone, size — with no element attached.
 *
 * Exported so a non-interactive twin of a button can look identical without copying the class
 * string. The one that needs it today is `SubscriptionBadge`: it must render a `<span>`, because a
 * `<button>` nested inside another button is invalid HTML and carves a dead zone out of the parent's
 * tap target — but it has to match `SubscriptionButton` pixel for pixel. Deriving both from here is
 * what keeps them from drifting.
 *
 * Not for reaching around `Button` to style arbitrary elements as buttons — if a thing is clickable,
 * use `Button`.
 */
export const buttonSurfaceClass = ({
    variant = 'solid',
    tone,
    accent = false,
    size = 'md',
    fullWidth = false,
}: ButtonSurfaceOptions = {}): string =>
    cn(
        'inline-flex items-center justify-center rounded-full font-semibold transition-colors',
        // Resolve tone: explicit `tone` wins; `accent` maps to green; otherwise
        // solid defaults to green, outline/ghost to gray (neutral).
        (() => {
            const resolvedTone = tone ?? (accent ? 'green' : variant === 'solid' ? 'green' : 'gray');
            if (variant === 'solid')
                return cn(SOLID_TONE[resolvedTone], 'disabled:bg-control-idle disabled:text-placeholder');
            if (variant === 'outline')
                return cn('border text-foreground disabled:opacity-50', OUTLINE_TONE[resolvedTone]);
            return 'text-foreground disabled:opacity-50';
        })(),
        SIZE[size],
        fullWidth && 'w-full'
    );

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
        return (
            <button
                ref={ref}
                type={type}
                disabled={disabled || loading}
                className={cn(buttonSurfaceClass({ variant, tone, accent, size, fullWidth }), className)}
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
