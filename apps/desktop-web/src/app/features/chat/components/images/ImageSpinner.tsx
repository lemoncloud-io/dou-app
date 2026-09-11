import { cn } from '@chatic/lib/utils';

interface ImageSpinnerProps {
    className?: string;
}

/** The white ring Figma draws over an uploading image ("이미지 로딩"). */
export const ImageSpinner = ({ className }: ImageSpinnerProps) => (
    <span
        aria-hidden
        className={cn(
            'block animate-spin rounded-full border-[3px] border-white/35 border-t-white motion-reduce:animate-none',
            className
        )}
    />
);
