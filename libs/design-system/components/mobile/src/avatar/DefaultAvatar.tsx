import { cn } from '@chatic/ui-kit';

import { IconGroup, IconUser } from '@chatic/design-system-assets/icons';
import { AvatarFrame } from './avatarBase';

export interface DefaultAvatarProps {
    size?: number;
    variant?: 'user' | 'group';
    className?: string;
}

export const DefaultAvatar = ({ size = 36, variant = 'user', className }: DefaultAvatarProps) => {
    const isGroup = variant === 'group';
    return (
        <AvatarFrame px={size} className={cn('bg-brand-ink', className)}>
            {isGroup ? (
                <IconGroup size={Math.round(size * 0.6)} className="text-white" />
            ) : (
                <IconUser size={size} className="text-white" />
            )}
        </AvatarFrame>
    );
};
