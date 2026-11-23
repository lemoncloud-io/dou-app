import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@chatic/ui-kit';

interface InviteCardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
}

export const InviteCard = ({ children, className, ...props }: InviteCardProps) => (
    <div
        className={cn(
            'flex flex-col items-center gap-4 rounded-[24px] border border-white/60 bg-white/45 px-4 py-6 dark:border-white/10 dark:bg-white/10',
            className
        )}
        {...props}
    >
        {children}
    </div>
);
