import type { ReactNode } from 'react';

import { cn } from '@chatic/ui-kit';

import { Checkbox } from '../../foundations/checkbox/Checkbox';
import { UnreadBadge } from '../../foundations/badge/UnreadBadge';
import { IconPin } from '../../resources/icons';

export interface ManageChannelItemProps {
    leading: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    time?: string;
    unread?: number;
    checked?: boolean;
    onToggle?: (checked: boolean) => void;
    selectable?: boolean;
    pinned?: boolean;
    onTogglePin?: (pinned: boolean) => void;
    selectLabel?: string;
    pinLabel?: string;
    unreadLabel?: string;
    className?: string;
}

export const ManageChannelItem = ({
    leading,
    title,
    subtitle,
    time,
    unread = 0,
    checked = false,
    onToggle,
    selectable = true,
    pinned = false,
    onTogglePin,
    selectLabel,
    pinLabel,
    unreadLabel,
    className,
}: ManageChannelItemProps) => (
    <div className={cn('flex items-center gap-2 pl-2 pr-3', className)}>
        {selectable ? (
            <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={selectLabel}
                onClick={() => onToggle?.(!checked)}
                className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
            >
                <Checkbox checked={checked} size={24} tone="accent" interactive={false} />
                <ManageChannelItemBody leading={leading} title={title} subtitle={subtitle} />
            </button>
        ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-[22px]">
                <ManageChannelItemBody leading={leading} title={title} subtitle={subtitle} />
            </div>
        )}

        <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-[12px] leading-4 text-description">{time}</span>
            <UnreadBadge count={unread} variant="pill" label={unreadLabel} />
        </div>

        <button
            type="button"
            aria-label={pinLabel}
            aria-pressed={pinned}
            onClick={() => onTogglePin?.(!pinned)}
            className={cn(
                'flex size-6 shrink-0 items-center justify-center',
                pinned ? 'text-foreground' : 'text-description'
            )}
        >
            <IconPin size={16} filled={pinned} />
        </button>
    </div>
);

const ManageChannelItemBody = ({
    leading,
    title,
    subtitle,
}: Pick<ManageChannelItemProps, 'leading' | 'title' | 'subtitle'>) => (
    <>
        <span className="shrink-0">{leading}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1.5 text-[16px] font-medium tracking-[-0.32px] text-foreground">
                {title}
            </span>
            {subtitle && (
                <span className="truncate text-[13px] font-medium leading-[1.4] tracking-[-0.13px] text-description">
                    {subtitle}
                </span>
            )}
        </span>
    </>
);
