import type { JSX, KeyboardEvent } from 'react';

import { cn } from '@chatic/lib/utils';

export interface InAppNotificationCardProps {
    title: string;
    body?: string;
    /** Absent when the push payload carries nothing routable — the card is then display-only. */
    onClick?: () => void;
}

/**
 * Foreground-push banner content rendered inside a Sonner custom toast.
 * Mirrors the OS notification layout (headline + snippet) and borrows the ui-kit
 * toast's visual tokens so in-app and system banners read as one family.
 */
export const InAppNotificationCard = ({ title, body, onClick }: InAppNotificationCardProps): JSX.Element => {
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick?.();
        }
    };

    return (
        <div
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? handleKeyDown : undefined}
            className={cn(
                // Theme-following surface (popover/card tokens), unlike the ui-kit toast's
                // intentionally inverted `bg-toast` — a notification banner should blend with
                // the app background in both light and dark themes.
                'pointer-events-auto flex w-full max-w-md flex-col gap-0.5 overflow-hidden rounded-xl border border-input-border border-l-[3px] border-l-main-accent bg-popover px-4 py-3.5 text-popover-foreground shadow-[0_8px_24px_-6px_rgba(0,0,0,0.16),0_2px_8px_-3px_rgba(0,0,0,0.08)]',
                onClick && 'cursor-pointer'
            )}
        >
            <p className="truncate text-[15px] font-semibold tracking-[-0.075px]">{title}</p>
            {body ? (
                <p className="line-clamp-2 text-[13px] leading-[1.5] tracking-[-0.065px] text-description">{body}</p>
            ) : null}
        </div>
    );
};
