import { cn } from '@chatic/ui-kit';

import { IconRetry, IconTrash } from '@chatic/design-system-assets/icons';

export interface FailedSendActionsProps {
    onRetry: () => void;
    onDelete: () => void;
    retryLabel?: string;
    deleteLabel?: string;
    align?: 'start' | 'end';
    className?: string;
}

const CHIP =
    'inline-flex shrink-0 items-center gap-1 rounded-full bg-action-soft py-1.5 pl-2.5 pr-3 text-[12px] font-semibold leading-[normal] transition-opacity active:opacity-70';

export const FailedSendActions = ({
    onRetry,
    onDelete,
    retryLabel = 'Retry',
    deleteLabel = 'Delete',
    align = 'end',
    className,
}: FailedSendActionsProps) => (
    <div className={cn('flex items-start gap-1.5', align === 'end' ? 'justify-end' : 'justify-start', className)}>
        <button type="button" onClick={onRetry} className={cn(CHIP, 'text-brand-ink dark:text-foreground')}>
            <IconRetry className="size-3.5" strokeWidth={2.5} aria-hidden />
            {retryLabel}
        </button>
        <button type="button" onClick={onDelete} className={cn(CHIP, 'text-description')}>
            <IconTrash className="size-3.5" strokeWidth={2.25} aria-hidden />
            {deleteLabel}
        </button>
    </div>
);
