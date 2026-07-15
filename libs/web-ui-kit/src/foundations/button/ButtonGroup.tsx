import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface ButtonGroupProps {
    /** Two (or more) Button nodes; each stretches to equal width. */
    children: React.ReactNode;
    className?: string;
}

/**
 * Two-button row — the design guide's "2 Button": side-by-side buttons of equal
 * width (e.g. a cancel/confirm pair). Compose with Button children.
 */
export const ButtonGroup = ({ children, className }: ButtonGroupProps) => {
    return <div className={cn('flex w-full items-center gap-2 [&>*]:flex-1', className)}>{children}</div>;
};
