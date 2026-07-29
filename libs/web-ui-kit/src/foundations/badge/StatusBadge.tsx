import { cn } from '@chatic/lib/utils';

import { Badge, type BadgeProps } from './Badge';

export interface StatusBadgeProps {
    label: string;
    /**
     * owner = 방장 (accent), pending = 초대 대기 중 (muted), mine = MY (dark),
     * expired = 초대 만료/거절 (muted — relay 1:1 invite rows, ADR-0033. The backend has no
     * distinct declined state yet, so a declined invite also uses this variant).
     */
    variant?: 'owner' | 'pending' | 'mine' | 'expired';
    className?: string;
}

const TONE: Record<NonNullable<StatusBadgeProps['variant']>, BadgeProps['tone']> = {
    owner: 'accent',
    pending: 'muted',
    mine: 'dark',
    expired: 'muted',
};

/**
 * Status role pill preset — the Figma tags (방장 / 초대 대기 중 / MY): a small solid
 * Badge, one tone per role.
 */
export const StatusBadge = ({ label, variant = 'owner', className }: StatusBadgeProps) => {
    return (
        <Badge variant="solid" tone={TONE[variant]} className={cn('px-2 py-0.5 text-[11px] leading-none', className)}>
            {label}
        </Badge>
    );
};
