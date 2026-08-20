import { cn } from '@chatic/lib/utils';

import { IconCheck } from '../../resources/icons';

export interface CheckboxProps {
    /** Checked state (controlled). */
    checked?: boolean;
    /** Change handler — receives the next checked value. */
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    /** Diameter in pixels. Defaults to the Figma spec (28). */
    size?: number;
    /**
     * Checked-state fill. `primary` is the Figma "CheckBox" component; `accent` is the
     * "Check Circle" glyph used by the chat-room management list (#90C304 disc, white check).
     */
    tone?: 'primary' | 'accent';
    /** Accessible label (used when interactive). */
    label?: string;
    /**
     * When false, renders a non-interactive visual indicator (a <span>) — use
     * this when a parent element (e.g. a selectable row) owns the click/role.
     */
    interactive?: boolean;
    className?: string;
}

const CHECKED_TONE = {
    primary: 'border-primary bg-primary text-primary-foreground',
    accent: 'border-main-accent bg-main-accent text-white',
} as const;

/**
 * Round checkbox — the Figma "CheckBox": a circle that is a filled green disc with a check when
 * checked, and a neutral outline when unchecked. Stateless and controlled. The checked fill comes
 * from `tone` — the two greens are distinct design tokens, not interchangeable.
 */
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
    // Keyed on `checked` so the pop-in animation restarts every time the check mark newly
    // appears, rather than once and never again (a stable key would only mount it the first time).
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
