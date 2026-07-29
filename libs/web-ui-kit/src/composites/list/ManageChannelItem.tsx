import type { ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { Checkbox } from '../../foundations/checkbox/Checkbox';
import { UnreadBadge } from '../../foundations/badge/UnreadBadge';
import { IconPin } from '../../resources/icons';

export interface ManageChannelItemProps {
    /** Leading avatar node (host supplies ImageAvatar / DefaultAvatar). */
    leading: ReactNode;
    /** Title line — host composes name plus any status badges. */
    title: ReactNode;
    /** Second line (last-message preview or an invite-status sentence). */
    subtitle?: ReactNode;
    /** Formatted last-activity time. */
    time?: string;
    unread?: number;
    /** Selected state; ignored when `selectable` is false. */
    checked?: boolean;
    onToggle?: (checked: boolean) => void;
    /**
     * false renders the row without a checkbox and with the content shifted into its place —
     * used for the self-chat row, which can be neither deleted nor left.
     */
    selectable?: boolean;
    pinned?: boolean;
    onTogglePin?: (pinned: boolean) => void;
    /** Accessible labels (host supplies localized strings). */
    selectLabel?: string;
    pinLabel?: string;
    unreadLabel?: string;
    className?: string;
}

/**
 * Chat-room management row — the Figma "채팅방 관리" list item (3408-28373): a selection
 * checkbox, the room avatar, its name/preview, the last-activity time with the unread count,
 * and a trailing pin toggle. The selection area and the pin are separate controls so tapping
 * the pin never changes the selection.
 */
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
        {/* Selection area — the row body itself is the checkbox control (the inner Checkbox is a
            visual indicator). A non-selectable row keeps the same padding so avatars stay aligned. */}
        {selectable ? (
            <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={selectLabel}
                onClick={() => onToggle?.(!checked)}
                className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
            >
                {/* 24px accent-toned check circle per Figma 3410-51128 — the management list uses
                    the #90C304 "Check Circle" glyph, not the primary-green "CheckBox". */}
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
