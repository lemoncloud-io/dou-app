import { cn } from '@chatic/lib/utils';

import { IconGroup, IconUser } from '../../resources/icons';

export interface DefaultAvatarProps {
    /** Diameter in pixels. */
    size?: number;
    /**
     * `user` (default) = single-person glyph, no ring — a peer/self placeholder.
     * `group` = three-person glyph with a hairline ring — a group/channel
     * placeholder (Figma "그룹방 Profile", node 3158:26238).
     */
    variant?: 'user' | 'group';
    className?: string;
}

/**
 * Default avatar placeholder — a flat brand-ink circle with a white glyph, used
 * wherever a profile photo hasn't been set yet (e.g. a header's peer/channel
 * avatar slot). `user` shows a person; `group` shows the three-person glyph with
 * a hairline ring, matching the Figma group-channel header.
 */
export const DefaultAvatar = ({ size = 36, variant = 'user', className }: DefaultAvatarProps) => {
    const isGroup = variant === 'group';
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-ink',
                isGroup && 'border border-border',
                className
            )}
            style={{ width: size, height: size }}
        >
            {isGroup ? (
                <IconGroup size={Math.round(size * 0.6)} className="text-white" />
            ) : (
                <IconUser size={Math.round(size * 0.5)} className="text-white" />
            )}
        </span>
    );
};
