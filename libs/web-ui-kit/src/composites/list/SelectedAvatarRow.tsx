import { cn } from '@chatic/lib/utils';

import { ProfileAvatar } from '../../foundations/avatar/ProfileAvatar';
import { IconClose } from '../../resources/icons';

export interface SelectedAvatarItem {
    /** Stable identity used as the React key and the `onRemove` argument. */
    id: string;
    /** Display name shown under the avatar. */
    name: string;
    /** Avatar image URL; falls back to the placeholder glyph. */
    avatarSrc?: string;
}

export interface SelectedAvatarRowProps {
    items: SelectedAvatarItem[];
    /** Called with the item id when its remove (X) badge is tapped. */
    onRemove: (id: string) => void;
    /** Accessible label prefix for the remove button (host supplies a localized string). */
    removeLabel?: string;
    className?: string;
}

/**
 * Horizontal scroll of selected users — the Figma friend-picker's "selected"
 * strip. Each entry is a circular ProfileAvatar with a small X badge pinned
 * top-right and a truncated name label below. Renders nothing when empty.
 */
export const SelectedAvatarRow = ({ items, onRemove, removeLabel = 'Remove', className }: SelectedAvatarRowProps) => {
    if (items.length === 0) return null;

    return (
        <div
            className={cn(
                'flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                className
            )}
        >
            {items.map(item => (
                <div key={item.id} className="flex w-[60px] shrink-0 flex-col items-center gap-1">
                    <div className="relative">
                        <ProfileAvatar src={item.avatarSrc} size={48} />
                        <button
                            type="button"
                            aria-label={`${removeLabel}: ${item.name}`}
                            onClick={() => onRemove(item.id)}
                            className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full border border-background bg-control-idle text-foreground"
                        >
                            <IconClose className="size-3" strokeWidth={2.5} />
                        </button>
                    </div>
                    <span className="w-full truncate text-center text-[13px] font-medium leading-[18px] tracking-[-0.15px] text-foreground">
                        {item.name}
                    </span>
                </div>
            ))}
        </div>
    );
};
