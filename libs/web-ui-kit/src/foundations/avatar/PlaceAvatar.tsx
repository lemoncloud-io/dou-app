import { cn } from '@chatic/lib/utils';

import { IconHome } from '../../resources/icons';
import { AvatarShell } from './avatarBase';

const SIZE = { sm: 36, md: 40, lg: 46 } as const;

export interface PlaceAvatarProps {
    /** Diameter step from the design guide (Small 36 / Medium 40 / Large 46). */
    size?: keyof typeof SIZE;
    className?: string;
}

/**
 * Place avatar — the design guide's "Place Profile": a navy (brand-ink) ringed
 * circle with a white home glyph. This is the generic place identity.
 */
export const PlaceAvatar = ({ size = 'lg', className }: PlaceAvatarProps) => (
    <AvatarShell px={SIZE[size]} className={cn('bg-brand-ink text-white', className)}>
        <IconHome className="size-[42%]" />
    </AvatarShell>
);
