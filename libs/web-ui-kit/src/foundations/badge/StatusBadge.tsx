import { cn } from '@chatic/ui-kit';

import { Badge, type BadgeProps } from './Badge';

export interface StatusBadgeProps {
    label: string;
    variant?: 'owner' | 'pending' | 'mine' | 'expired';
    className?: string;
}

const TONE: Record<NonNullable<StatusBadgeProps['variant']>, BadgeProps['tone']> = {
    owner: 'accent',
    pending: 'muted',
    mine: 'dark',
    expired: 'muted',
};

export const StatusBadge = ({ label, variant = 'owner', className }: StatusBadgeProps) => {
    return (
        <Badge variant="solid" tone={TONE[variant]} className={cn('px-2 py-0.5 text-[11px] leading-none', className)}>
            {label}
        </Badge>
    );
};
