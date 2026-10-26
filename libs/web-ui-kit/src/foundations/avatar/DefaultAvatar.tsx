import { cn } from '@chatic/lib/utils';

import { IconGroup, IconUser } from '../../resources/icons';
import { AvatarFrame } from './avatarBase';

export interface DefaultAvatarProps {
    /** Diameter in pixels, stroke included. */
    size?: number;
    /**
     * Which of the two avatar images to draw:
     * `user` (default) = the solid single-person silhouette (Figma "1-person Profile", node 3185:13127).
     * `group` = the three-person glyph (Figma "Group room Profile", node 3158:26238).
     *
     * There is no outline variant — the room avatar has exactly these two images.
     */
    variant?: 'user' | 'group';
    className?: string;
}

/**
 * Default avatar placeholder — a brand-ink circle with a white glyph under the same stroke
 * {@link ImageAvatar} draws, used wherever a profile photo hasn't been set yet (a header's
 * peer/channel avatar slot, a list row), so a member reads the same with and without a photo.
 *
 * For a grey placeholder on a light surface (my-page rows, ProfileAvatar) reach for
 * `IconUserOutline` directly instead — that is a different job from this one.
 */
export const DefaultAvatar = ({ size = 36, variant = 'user', className }: DefaultAvatarProps) => {
    const isGroup = variant === 'group';
    return (
        <AvatarFrame px={size} className={cn('bg-brand-ink', className)}>
            {isGroup ? (
                <IconGroup size={Math.round(size * 0.6)} className="text-white" />
            ) : (
                // Full-size: the glyph's viewBox matches the avatar circle, so the silhouette sits
                // circle-relative exactly as in Figma.
                <IconUser size={size} className="text-white" />
            )}
        </AvatarFrame>
    );
};
