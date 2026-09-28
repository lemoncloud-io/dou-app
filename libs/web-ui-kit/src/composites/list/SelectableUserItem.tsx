import { cn } from '@chatic/lib/utils';

import { ProfileAvatar } from '../../foundations/avatar/ProfileAvatar';
import { Checkbox } from '../../foundations/checkbox/Checkbox';

export interface SelectableUserItemProps {
    /** Display name. */
    name: string;
    /** Secondary line under the name; omitted (not an empty line) when blank. */
    subtitle?: string;
    /** Avatar image URL; falls back to the placeholder glyph. */
    avatarSrc?: string;
    /** Selected state (controlled). */
    checked?: boolean;
    /** Toggle handler — receives the next checked value. */
    onToggle?: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}

/**
 * Selectable user row — the Figma "friend invite list" item: an avatar + name + round
 * checkbox. Composed from ProfileAvatar + Checkbox. The whole row is the control
 * (single accessible checkbox); the inner Checkbox is a visual indicator.
 */
export const SelectableUserItem = ({
    name,
    subtitle,
    avatarSrc,
    checked = false,
    onToggle,
    disabled = false,
    className,
}: SelectableUserItemProps) => {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onToggle?.(!checked)}
            className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100',
                className
            )}
        >
            <ProfileAvatar src={avatarSrc} size={42} />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[16px] font-medium tracking-[-0.5px] text-foreground">{name}</span>
                {subtitle && <span className="truncate text-[14px] leading-[1.4] text-description">{subtitle}</span>}
            </span>
            <Checkbox checked={checked} interactive={false} />
        </button>
    );
};
