import { cn } from '@chatic/lib/utils';

export interface DividerProps {
    /** `line` = 1px hairline; `block` = thick section separator. */
    variant?: 'line' | 'block';
    className?: string;
}

/**
 * Horizontal separator. `line` for between rows, `block` for the thick divider
 * between settings groups.
 */
export const Divider = ({ variant = 'line', className }: DividerProps) => {
    return (
        <div
            role="separator"
            className={cn('w-full', variant === 'block' ? 'h-1 bg-secondary' : 'h-px bg-input-border', className)}
        />
    );
};
