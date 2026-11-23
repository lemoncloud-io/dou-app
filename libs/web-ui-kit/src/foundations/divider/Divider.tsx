import { cn } from '@chatic/ui-kit';

export interface DividerProps {
    variant?: 'line' | 'block';
    className?: string;
}

export const Divider = ({ variant = 'line', className }: DividerProps) => {
    return (
        <div
            role="separator"
            className={cn('w-full', variant === 'block' ? 'h-1 bg-secondary' : 'h-px bg-input-border', className)}
        />
    );
};
