import { cn } from '@chatic/lib/utils';

import { IconGroup, IconUser, IconUserSolid } from '../../resources/icons';

export interface DefaultAvatarProps {
    /** Diameter in pixels. */
    size?: number;
    /**
     * `user` (default) = single-person lucide glyph, no ring — a generic peer
     * placeholder.
     * `group` = three-person glyph with a hairline ring — a group/channel
     * placeholder (Figma "그룹방 Profile", node 3158:26238).
     * `self` = solid single-person silhouette with a hairline ring — the
     * "나와의 채팅" placeholder (Figma "1명 Profile", node 3185:13127). Distinct
     * from `user`: a filled silhouette + ring rather than the lucide outline.
     */
    variant?: 'user' | 'group' | 'self';
    className?: string;
}

/**
 * Default avatar placeholder — a flat brand-ink circle with a white glyph, used
 * wherever a profile photo hasn't been set yet (e.g. a header's peer/channel
 * avatar slot). `user` shows a lucide person; `group` shows the three-person
 * glyph with a hairline ring; `self` shows the solid single-person silhouette
 * with a hairline ring (self-chat design).
 */
export const DefaultAvatar = ({ size = 36, variant = 'user', className }: DefaultAvatarProps) => {
    const isGroup = variant === 'group';
    const isSelf = variant === 'self';
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-ink',
                (isGroup || isSelf) && 'border border-border',
                className
            )}
            style={{ width: size, height: size }}
        >
            {isGroup ? (
                <IconGroup size={Math.round(size * 0.6)} className="text-white" />
            ) : isSelf ? (
                // Full-size: the glyph's viewBox matches the avatar circle, so the
                // silhouette sits circle-relative exactly as in Figma.
                <IconUserSolid size={size} className="text-white" />
            ) : (
                <IconUser size={Math.round(size * 0.5)} className="text-white" />
            )}
        </span>
    );
};
