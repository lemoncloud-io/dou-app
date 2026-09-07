import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface SystemNoticeProps {
    /**
     * Notice content — the host composes it, e.g. a bold `<b>name</b>` prefix
     * followed by a localized clause ("…님이 채팅방에 입장했습니다.").
     */
    children: React.ReactNode;
    /**
     * `default` is the neutral pill. `alert` drops the tint and reddens the text, for a notice the
     * room is not neutral about — a 1:1 losing its only other participant (Figma 4041-33606). The
     * group stream keeps the pill for every notice, including leaves.
     */
    tone?: 'default' | 'alert';
    className?: string;
}

/**
 * In-stream system notice — the Figma join/leave chip: a centered, pill-shaped
 * banner on a faint brand tint, or bare red text in the `alert` tone. Purely
 * presentational; the host builds the localized sentence (bold subject + clause)
 * and passes it as children.
 */
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
