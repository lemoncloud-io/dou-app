import { cn } from '@chatic/ui-kit';

import { IconAlert } from '@chatic/design-system-assets/icons';

export type CloudStatusVariant = 'provisioning' | 'failed' | 'ending' | 'restricted';

export interface CloudStatusBadgeProps {
    label: string;
    variant: CloudStatusVariant;
    className?: string;
}

const VARIANT_CLASS: Record<CloudStatusVariant, string> = {
    provisioning: 'bg-[hsl(var(--point-blue)/0.08)] text-point-blue',
    failed: 'bg-[hsl(var(--destructive)/0.08)] text-destructive',
    ending: 'bg-[hsl(var(--warning,38_92%_50%)/0.08)] text-[hsl(var(--warning,38_92%_50%))]',
    restricted: 'bg-secondary text-description',
};

export const CloudStatusBadge = ({ label, variant, className }: CloudStatusBadgeProps) => {
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-[6px] px-2 py-1 text-[12px] font-medium leading-4 tracking-[-0.06px]',
                VARIANT_CLASS[variant],
                className
            )}
        >
            {variant === 'restricted' && <IconAlert aria-hidden className="size-4" />}
            {label}
        </span>
    );
};
