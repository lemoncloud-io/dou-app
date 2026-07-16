import { cn } from '@chatic/lib/utils';

export interface ImageAvatarProps {
    /** Image URL. */
    src: string;
    /** Alt text for the image. */
    alt?: string;
    /** Diameter in pixels. */
    size?: number;
    className?: string;
}

/**
 * Circular photo avatar — crops an arbitrary-sized image into a fixed circle
 * (object-cover). The box is `inline-flex` with an explicit pixel width/height,
 * so the diameter holds even when nested inside a non-flex parent; a bare inline
 * `<span>` would drop width/height there and let the image render at its natural
 * size (the square-thumbnail bug this replaces — see ADR-0014).
 */
export const ImageAvatar = ({ src, alt = '', size = 46, className }: ImageAvatarProps) => (
    <span
        className={cn('inline-flex shrink-0 overflow-hidden rounded-full', className)}
        style={{ width: size, height: size }}
    >
        <img src={src} alt={alt} className="h-full w-full object-cover" />
    </span>
);
