import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { OutlineButton } from '../../foundations/button/OutlineButton';

export interface IconEmptyStateProps {
    /** The glyph in the grey disc (28px, e.g. `IconNavBell`). */
    icon: React.ReactNode;
    title: string;
    /** One or two lines under the title; line breaks in the string are kept. */
    description?: string;
    /** An optional way out (e.g. a localized "Show all notifications"). */
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

/**
 * Centred empty state with an icon — the notification screens' "공백" block (Figma 6033:21159): a
 * 64px grey disc with a glyph, a bold title and a grey description, centred well down the screen.
 * Unlike {@link EmptyState}, which leads a section from its left edge, this one stands for a whole
 * screen with nothing in it.
 */
export const IconEmptyState = ({ icon, title, description, actionLabel, onAction, className }: IconEmptyStateProps) => (
    <div className={cn('flex w-full flex-col items-center gap-2 px-8 pb-10 pt-[150px] text-center', className)}>
        <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-action-soft text-nav-ink">
            {icon}
        </span>
        <span aria-hidden className="h-2" />
        <p className="text-[17px] font-bold text-brand-ink dark:text-foreground">{title}</p>
        {description && <p className="whitespace-pre-line text-[14px] leading-[1.5] text-description">{description}</p>}
        {actionLabel && onAction && (
            <OutlineButton size="md" onClick={onAction} className="mt-3">
                {actionLabel}
            </OutlineButton>
        )}
    </div>
);
