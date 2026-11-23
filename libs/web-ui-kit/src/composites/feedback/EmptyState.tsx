import { cn } from '@chatic/ui-kit';

import { IconChevronRight } from '../../resources/icons';
import { OutlineButton } from '../../foundations/button/OutlineButton';

export interface EmptyStateProps {
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

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
