import { cn } from '@chatic/ui-kit';

import { defaultPlaceAvatar, douHomeAvatar } from '../../resources/assets';
import { IconGroup, IconPlus, IconUser } from '../../resources/icons';
import { AvatarFrame } from './avatarBase';

const HOME_GLYPH_RATIO = 58 / 86;

export interface ProfileAvatarProps {
    src?: string;
    alt?: string;
    size?: number;
    glyph?: 'user' | 'group' | 'place' | 'home';
    onSelect?: () => void;
    selectLabel?: string;
    className?: string;
}

export const ProfileAvatar = ({
    src,
    alt = '',
    size = 86,
    glyph = 'user',
    onSelect,
    selectLabel = 'Select photo',
    className,
}: ProfileAvatarProps) => {
    const Root = onSelect ? 'button' : 'div';
    const isLightDisc = !src && glyph === 'home';

    return (
        <Root
            {...(onSelect ? { type: 'button' as const, onClick: onSelect, 'aria-label': selectLabel } : {})}
            className={cn('relative inline-flex shrink-0', className)}
            style={{ width: size, height: size }}
        >
            <AvatarFrame
                px={size}
                stroke={isLightDisc ? null : undefined}
                className={isLightDisc ? 'bg-avatar-ring' : 'bg-brand-ink'}
            >
                {src ? (
                    <img src={src} alt={alt} className="h-full w-full object-cover" />
                ) : glyph === 'home' ? (
                    <img
                        src={douHomeAvatar}
                        alt={alt}
                        className="object-contain"
                        style={{
                            width: Math.round(size * HOME_GLYPH_RATIO),
                            height: Math.round(size * HOME_GLYPH_RATIO),
                        }}
                    />
                ) : glyph === 'place' ? (
                    <img src={defaultPlaceAvatar} alt={alt} className="h-full w-full object-cover" />
                ) : glyph === 'group' ? (
                    <IconGroup size={Math.round(size * 0.56)} className="text-white" />
                ) : (
                    <IconUser size={size} className="text-white" />
                )}
            </AvatarFrame>
            {onSelect && (
                <span
                    className={cn(
                        'absolute -right-1 bottom-0 flex items-center justify-center rounded-full border-2 border-surface p-1.5',
                        isLightDisc ? 'bg-brand-ink' : 'bg-muted'
                    )}
                >
                    <IconPlus className={cn('h-[18px] w-[18px]', isLightDisc ? 'text-white' : 'text-label')} />
                </span>
            )}
        </Root>
    );
};
