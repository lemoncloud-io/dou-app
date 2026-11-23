import { AvatarFrame } from './avatarBase';

export interface ImageAvatarProps {
    src: string;
    alt?: string;
    size?: number;
    className?: string;
}

export const ImageAvatar = ({ src, alt = '', size = 46, className }: ImageAvatarProps) => (
    <AvatarFrame px={size} className={className}>
        <img src={src} alt={alt} className="h-full w-full object-cover" />
    </AvatarFrame>
);
