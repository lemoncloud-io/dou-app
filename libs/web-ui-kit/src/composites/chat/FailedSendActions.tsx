import { cn } from '@chatic/lib/utils';

import { IconRetry, IconTrash } from '../../resources/icons';

export interface FailedSendActionsProps {
    /** Send the failed message again (Figma "재전송", 6072:23046). */
    onRetry: () => void;
    /** Drop the failed message (Figma "삭제", 6072:23050). Whether to ask first is the host's call. */
    onDelete: () => void;
    retryLabel?: string;
    deleteLabel?: string;
    /** Which edge of the row the chips hug — `end` under my bubble, which sits on the right. */
    align?: 'start' | 'end';
    className?: string;
}

const CHIP =
    'inline-flex shrink-0 items-center gap-1 rounded-full bg-action-soft py-1.5 pl-2.5 pr-3 text-[12px] font-semibold leading-[normal] transition-opacity active:opacity-70';

/**
 * The two chips under a message that failed to send (Figma "음성 파일 · 실패 동작", 6072:23054):
 * retry, in the brand ink because it is the way forward, then delete, muted.
 *
 * Under the bubble rather than in a menu, so a failed send can be dealt with without knowing a long
 * press exists.
 */
export const FailedSendActions = ({
    onRetry,
    onDelete,
    retryLabel = 'Retry',
    deleteLabel = 'Delete',
    align = 'end',
    className,
}: FailedSendActionsProps) => (
    <div className={cn('flex items-start gap-1.5', align === 'end' ? 'justify-end' : 'justify-start', className)}>
        {/* Navy reads on the light chip; in dark mode the chip darkens too, so the label lightens with it. */}
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
