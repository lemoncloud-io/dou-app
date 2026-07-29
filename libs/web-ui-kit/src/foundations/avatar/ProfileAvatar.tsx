import { cn } from '@chatic/lib/utils';

import { IconGroup, IconPlus, IconUser } from '../../resources/icons';

export interface ProfileAvatarProps {
    /** Image URL; when absent a placeholder glyph (or `defaultImage`) is shown. */
    src?: string;
    /** Alt text for the image. */
    alt?: string;
    /** Diameter in pixels. Defaults to the Figma spec (86). */
    size?: number;
    /** Placeholder glyph when there is no image: a single person ('user') or a group ('group'). */
    glyph?: 'user' | 'group';
    /**
     * Full-bleed placeholder image shown instead of the glyph when there is no `src` — e.g. the
     * illustrated default place avatar (Figma node 3036:12309). Takes precedence over `glyph`.
     */
    defaultImage?: string;
    /** When provided, the avatar becomes a button (e.g. to pick a photo). */
    onSelect?: () => void;
    /** Accessible label for the select action. */
    selectLabel?: string;
    className?: string;
}

/**
 * Profile avatar with a "+" badge — the Figma "Profile" component. A circular
 * image (or placeholder glyph) ringed by a subtle border, with a dark plus badge
 * pinned bottom-right as the change-photo affordance.
 */
export const ProfileAvatar = ({
    src,
    alt = '',
    size = 86,
    glyph = 'user',
    defaultImage,
    onSelect,
    selectLabel = 'Select photo',
    className,
}: ProfileAvatarProps) => {
    const Root = onSelect ? 'button' : 'div';
    const isGroup = glyph === 'group';
    // Placeholder glyph scales with the avatar; ~42% reads well at the 86px default (a bit larger
    // for the group glyph, which reads smaller than the single-user glyph at the same box size).
    const glyphSize = Math.round(size * (isGroup ? 0.56 : 0.42));

    return (
        <Root
            {...(onSelect ? { type: 'button' as const, onClick: onSelect, 'aria-label': selectLabel } : {})}
            className={cn('relative inline-flex shrink-0', className)}
            style={{ width: size, height: size }}
        >
            <span
                className={cn(
                    'flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-avatar-ring',
                    isGroup ? 'bg-brand-ink' : 'bg-muted'
                )}
            >
                {src ? (
                    <img src={src} alt={alt} className="h-full w-full object-cover" />
                ) : defaultImage && !isGroup ? (
                    <img src={defaultImage} alt={alt} className="h-full w-full object-cover" />
                ) : isGroup ? (
                    <IconGroup size={glyphSize} className="text-white" />
                ) : (
                    <IconUser size={glyphSize} className="text-placeholder" />
                )}
            </span>
            {onSelect && (
                <span className="absolute -right-1 bottom-0 flex items-center justify-center rounded-full border-2 border-surface bg-brand-ink p-1.5">
                    <IconPlus className="h-[18px] w-[18px] text-white" />
                </span>
            )}
        </Root>
    );
};
