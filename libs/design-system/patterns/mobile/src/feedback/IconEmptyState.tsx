import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { OutlineButton } from '@chatic/design-system-components-mobile';

export interface IconEmptyStateProps {
    icon: React.ReactNode;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

export const IconEmptyState = ({ icon, title, description, actionLabel, onAction, className }: IconEmptyStateProps) => (
    <div
        className={cn(
            'flex w-full flex-col items-center gap-2 px-8 pb-10 pt-[150px] text-center',
            'duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none',
            className
        )}
    >
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
