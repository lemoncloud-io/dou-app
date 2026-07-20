import { cn } from '@chatic/lib/utils';

import { IconHome } from '../../resources/icons';
import { AvatarShell } from './avatarBase';

const SIZE = { sm: 36, md: 40, lg: 46 } as const;

export interface PlaceAvatarProps {
    /**
     * Place name — drives the initial glyph. When absent (e.g. an invite whose
     * name hasn't loaded), a generic home glyph is shown instead.
     */
    name?: string;
    /** Diameter step from the design guide (Small 36 / Medium 40 / Large 46). */
    size?: keyof typeof SIZE;
    className?: string;
}

/**
 * Place avatar — the design guide's "Place Profile" (Figma 3153:25983): a light
 * disc (avatar-ring #F4F5F5) carrying the place's navy (brand-ink #102346)
 * initial. Unlike CloudAvatar, every place uses the same single tone rather than
 * a name-derived palette, so places read as one consistent brand identity.
 * Falls back to a home glyph when no name is available.
 */
export const PlaceAvatar = ({ name, size = 'lg', className }: PlaceAvatarProps) => {
    const px = SIZE[size];
    const trimmed = name?.trim() ?? '';
    const initial = trimmed ? [...trimmed][0].toUpperCase() : null;

    return (
        <AvatarShell px={px} className={cn('bg-avatar-ring font-semibold text-brand-ink', className)}>
            {initial ? (
                // Match CloudAvatar's initial scale (~42%) so the two avatar families align in a list.
                <span style={{ fontSize: Math.round(px * 0.42) }}>{initial}</span>
            ) : (
                <IconHome className="size-[42%]" />
            )}
        </AvatarShell>
    );
};
