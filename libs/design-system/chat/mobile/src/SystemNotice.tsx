import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface SystemNoticeProps {
    children: React.ReactNode;
    tone?: 'default' | 'alert';
    className?: string;
}

export const SystemNotice = ({ children, tone = 'default', className }: SystemNoticeProps) => (
    <div className="flex w-full justify-center px-4 py-1">
        <span
            className={cn(
                'rounded-full px-2.5 py-1.5 text-center text-[14px] tracking-[-0.21px]',
                tone === 'alert' ? 'text-destructive' : 'bg-brand-ink/5 text-foreground',
                className
            )}
        >
            {children}
        </span>
    </div>
);
