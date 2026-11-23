import { cn } from '@chatic/ui-kit';

import { IconCheck } from '../../resources/icons';

export interface CheckboxProps {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    size?: number;
    tone?: 'primary' | 'accent' | 'ink';
    label?: string;
    interactive?: boolean;
    className?: string;
}

const CHECKED_TONE = {
    primary: 'border-primary bg-primary text-primary-foreground',
    accent: 'border-main-accent bg-main-accent text-white',
    ink: 'border-chip-ink bg-chip-ink text-white',
} as const;

export const Checkbox = ({
    checked = false,
    onCheckedChange,
    disabled = false,
    size = 28,
    tone = 'primary',
    label = 'checkbox',
    interactive = true,
    className,
}: CheckboxProps) => {
    const classes = cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-200',
        checked ? CHECKED_TONE[tone] : 'border-placeholder',
        disabled && 'opacity-50',
        interactive && 'active:scale-90',
        className
    );
    const glyph = checked ? (
        <span key="check" className="animate-in zoom-in-50 fade-in-0 duration-200">
            <IconCheck className="size-4" strokeWidth={3} />
        </span>
    ) : null;
    const style = { width: size, height: size };

    if (!interactive) {
        return (
            <span aria-hidden className={classes} style={style}>
                {glyph}
            </span>
        );
    }

    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onCheckedChange?.(!checked)}
            className={classes}
            style={style}
        >
            {glyph}
        </button>
    );
};
