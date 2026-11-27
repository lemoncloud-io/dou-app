import { cn } from '@chatic/ui-kit';

import { IconHome } from '@chatic/design-system-assets/icons';
import { AvatarFrame } from './avatarBase';

const SIZE = { sm: 36, md: 40, lg: 46 } as const;

export interface PlaceAvatarProps {
    name?: string;
    size?: keyof typeof SIZE;
    className?: string;
}

export const PlaceAvatar = ({ name, size = 'lg', className }: PlaceAvatarProps) => {
    const px = SIZE[size];
    const trimmed = name?.trim() ?? '';
    const initial = trimmed ? [...trimmed][0].toUpperCase() : null;

    return (
        <AvatarFrame
            px={px}
            stroke="border-avatar-ring"
            className={cn('bg-avatar-ring font-semibold text-brand-ink', className)}
        >
            {initial ? (
                <span style={{ fontSize: Math.round(px * 0.42) }}>{initial}</span>
            ) : (
                <IconHome className="size-[42%]" />
            )}
        </AvatarFrame>
    );
};
