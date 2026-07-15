import { cn } from '@chatic/lib/utils';

import { IconUser } from '../../resources/icons';

export interface DefaultAvatarProps {
    /** Diameter in pixels. */
    size?: number;
    className?: string;
}

/**
 * Default person-profile avatar — a flat brand-ink circle with a white user
 * glyph (no ring), used wherever a profile photo hasn't been set yet (e.g. a
 * header's place/peer avatar slot). Matches the Figma "1명 Profile" empty state.
 */
export const DefaultAvatar = ({ size = 36, className }: DefaultAvatarProps) => (
    <span
        className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-brand-ink', className)}
        style={{ width: size, height: size }}
    >
        <IconUser size={Math.round(size * 0.5)} className="text-white" />
    </span>
);
