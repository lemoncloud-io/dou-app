import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface SystemNoticeProps {
    /**
     * Notice content — the host composes it, e.g. a bold `<b>name</b>` prefix
     * followed by a localized clause ("…님이 채팅방에 입장했습니다.").
     */
    children: React.ReactNode;
    className?: string;
}

/**
 * In-stream system notice pill — the Figma join/leave chip: a centered,
 * pill-shaped banner on a faint brand tint. Purely presentational; the host
 * builds the localized sentence (bold subject + clause) and passes it as children.
 */
export const SystemNotice = ({ children, className }: SystemNoticeProps) => (
    <div className="flex w-full justify-center px-4 py-1">
        <span
            className={cn(
                'rounded-full bg-brand-ink/5 px-2.5 py-1.5 text-center text-[14px] tracking-[-0.21px] text-foreground',
                className
            )}
        >
            {children}
        </span>
    </div>
);
