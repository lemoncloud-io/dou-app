import { type JSX } from 'react';

import { cn } from '../../utils';

export const Spinner = ({ className, label }: { className?: string; label?: string }): JSX.Element => (
    <span role="status" aria-label={label} className={cn('inline-flex', className)}>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-navy" />
    </span>
);
