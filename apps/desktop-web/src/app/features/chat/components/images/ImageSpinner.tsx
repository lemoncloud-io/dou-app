import { cn } from '@chatic/ui-kit';

interface ImageSpinnerProps {
    className?: string;
}

export const ImageSpinner = ({ className }: ImageSpinnerProps) => (
    <span
        aria-hidden
        className={cn(
            'block animate-spin rounded-full border-[3px] border-on-overlay/35 border-t-on-overlay motion-reduce:animate-none',
            className
        )}
    />
);
