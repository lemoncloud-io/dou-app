import { cn } from '@chatic/lib/utils';

import { IconGroup, IconUser } from '../../resources/icons';

export interface DefaultAvatarProps {
    /** Diameter in pixels. */
    size?: number;
    /**
     * Which of the two avatar images to draw:
     * `user` (default) = the solid single-person silhouette (Figma "1명 Profile", node 3185:13127).
     * `group` = the three-person glyph (Figma "그룹방 Profile", node 3158:26238).
     *
     * There is no outline variant — the room avatar has exactly these two images.
     */
    variant?: 'user' | 'group';
    className?: string;
}

/**
 * Default avatar placeholder — a brand-ink circle with a hairline ring and a white glyph, used
 * wherever a profile photo hasn't been set yet (a header's peer/channel avatar slot, a list row).
 *
 * For a grey placeholder on a light surface (my-page rows, ProfileAvatar) reach for
 * `IconUserOutline` directly instead — that is a different job from this one.
 */
export const DefaultAvatar = ({ size = 36, variant = 'user', className }: DefaultAvatarProps) => {
    const isGroup = variant === 'group';
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-brand-ink',
                className
            )}
            style={{ width: size, height: size }}
        >
            {isGroup ? (
                <IconGroup size={Math.round(size * 0.6)} className="text-white" />
            ) : (
                // Full-size: the glyph's viewBox matches the avatar circle, so the silhouette sits
                // circle-relative exactly as in Figma.
                <IconUser size={size} className="text-white" />
            )}
        </span>
    );
};
