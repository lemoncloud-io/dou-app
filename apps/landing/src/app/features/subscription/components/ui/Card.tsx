import { type HTMLAttributes, type JSX } from 'react';

import { cn } from '../../utils';

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
    <div className={cn('rounded-2xl border border-border bg-card p-6', className)} {...props} />
);
