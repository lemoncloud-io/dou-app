import { AvatarFrame } from './avatarBase';

export interface ImageAvatarProps {
    /** Image URL. */
    src: string;
    /** Alt text for the image. */
    alt?: string;
    /** Diameter in pixels, stroke included. */
    size?: number;
    className?: string;
}

/**
 * Circular photo avatar — crops an arbitrary-sized image into a fixed circle (object-cover) and
 * draws the Figma "1-person Profile" stroke over its edge, so a light photo still reads as a circle on a
 * white screen. The box is `inline-flex` with an explicit pixel width/height, so the diameter holds
 * even when nested inside a non-flex parent; a bare inline `<span>` would drop width/height there
 * and let the image render at its natural size (the square-thumbnail bug this replaces).
 */
export const ImageAvatar = ({ src, alt = '', size = 46, className }: ImageAvatarProps) => (
    <AvatarFrame px={size} className={className}>
        <img src={src} alt={alt} className="h-full w-full object-cover" />
    </AvatarFrame>
);
