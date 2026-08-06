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
 * Profile avatar with a "+" badge — the Figma "Profile" component. A circular image (or placeholder
 * glyph) ringed by a hairline border, with a plus badge pinned bottom-right as the change-photo
 * affordance.
 *
 * The empty state is Figma's "1명 Profile" (3177-13120): a brand-ink circle with the white solid
 * person silhouette — the same placeholder {@link DefaultAvatar} draws, so a member with no photo
 * looks identical whether they appear in a list row or on this 86px profile. It used to be a grey
 * circle with an outline glyph, which is why the profile screens disagreed with every list.
 *
 * The badge is therefore light-on-dark (`bg-muted`), not the previous brand-ink fill: every
 * placeholder this component can show — person, group, or the illustrated default place image — is
 * dark, so a dark badge had no contrast to sit against.
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

    return (
        <Root
            {...(onSelect ? { type: 'button' as const, onClick: onSelect, 'aria-label': selectLabel } : {})}
            className={cn('relative inline-flex shrink-0', className)}
            style={{ width: size, height: size }}
        >
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-avatar-ring bg-brand-ink">
                {src ? (
                    <img src={src} alt={alt} className="h-full w-full object-cover" />
                ) : defaultImage && !isGroup ? (
                    <img src={defaultImage} alt={alt} className="h-full w-full object-cover" />
                ) : isGroup ? (
                    // The group glyph is a plain icon, so it needs insetting to read as centred.
                    <IconGroup size={Math.round(size * 0.56)} className="text-white" />
                ) : (
                    // Full-size: the silhouette's viewBox matches the avatar circle, so it sits
                    // circle-relative exactly as in Figma (same as DefaultAvatar).
                    <IconUser size={size} className="text-white" />
                )}
            </span>
            {onSelect && (
                <span className="absolute -right-1 bottom-0 flex items-center justify-center rounded-full border-2 border-surface bg-muted p-1.5">
                    <IconPlus className="h-[18px] w-[18px] text-label" />
                </span>
            )}
        </Root>
    );
};
