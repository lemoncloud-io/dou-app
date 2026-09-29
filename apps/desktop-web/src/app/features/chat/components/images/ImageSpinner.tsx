import { cn } from '@chatic/lib/utils';

interface ImageSpinnerProps {
    className?: string;
}

/** The ring Figma draws over an uploading image ("image loading"), in the scrim's own ink. */
export const ImageSpinner = ({ className }: ImageSpinnerProps) => (
    <span
        aria-hidden
        className={cn(
            'block animate-spin rounded-full border-[3px] border-on-overlay/35 border-t-on-overlay motion-reduce:animate-none',
            className
        )}
    />
);
