import { cn } from '@chatic/lib/utils';

import { IconChevronRight } from '../../resources/icons';
import { OutlineButton } from '../../foundations/button/OutlineButton';

export interface EmptyStateProps {
    /** Bold heading. */
    title: string;
    /** Supporting sentence below the title. */
    description?: string;
    /** Outline pill action label; renders the button only when paired with onAction. */
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

/**
 * Empty / waiting state — the Figma "친구의 응답을 기다리고 있어요" block: a title, a
 * description, and an optional outline pill action with a trailing chevron.
 */
export const EmptyState = ({ title, description, actionLabel, onAction, className }: EmptyStateProps) => {
    return (
        <div className={cn('flex w-full flex-col gap-6 px-4 py-2.5', className)}>
            <div className="flex flex-col gap-1.5">
                <p className="text-[18px] font-semibold leading-[26px] tracking-[-0.09px] text-foreground">{title}</p>
                {description && (
                    <p className="text-[16px] leading-[22px] tracking-[-0.08px] text-label">{description}</p>
                )}
            </div>

            {actionLabel && onAction && (
                <OutlineButton
                    size="md"
                    onClick={onAction}
                    trailingIcon={<IconChevronRight className="size-[18px]" />}
                    className="self-start tracking-[0.07px]"
                >
                    {actionLabel}
                </OutlineButton>
            )}
        </div>
    );
};
