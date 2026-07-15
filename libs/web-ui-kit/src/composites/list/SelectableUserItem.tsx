import { cn } from '@chatic/lib/utils';

import { ProfileAvatar } from '../../foundations/avatar/ProfileAvatar';
import { Checkbox } from '../../foundations/checkbox/Checkbox';

export interface SelectableUserItemProps {
    /** Display name. */
    name: string;
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
 * Selectable user row — the Figma "친구초대 리스트" item: an avatar + name + round
 * checkbox. Composed from ProfileAvatar + Checkbox. The whole row is the control
 * (single accessible checkbox); the inner Checkbox is a visual indicator.
 */
export const SelectableUserItem = ({
    name,
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
            className={cn('flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-50', className)}
        >
            <ProfileAvatar src={avatarSrc} size={42} />
            <span className="min-w-0 flex-1 truncate text-[16px] font-medium tracking-[-0.5px] text-foreground">
                {name}
            </span>
            <Checkbox checked={checked} interactive={false} />
        </button>
    );
};
