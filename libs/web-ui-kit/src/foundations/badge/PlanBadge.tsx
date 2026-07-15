import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconPlan } from '../../resources/icons';
import { Badge } from './Badge';

export interface PlanBadgeProps {
    /** Tier label (e.g. "FREE", "PRO"). */
    label: string;
    /** Leading icon; defaults to a sparkles glyph. */
    icon?: React.ReactNode;
    /** Accent (green) outline — used for paid tiers (e.g. PRO). */
    accent?: boolean;
    className?: string;
}

/**
 * Subscription tier badge preset — the Figma "구독 상태 뱃지": an outline Badge with
 * a leading glyph and the tier label. `accent` switches the outline to brand green.
 */
export const PlanBadge = ({ label, icon, accent = false, className }: PlanBadgeProps) => {
    return (
        <Badge
            variant="outline"
            tone={accent ? 'accent' : 'default'}
            icon={icon ?? <IconPlan className="size-4 text-foreground" />}
            className={cn('py-2.5 pl-2.5 pr-3', className)}
        >
            <span className="text-[13px] leading-3 tracking-[-0.13px]">{label}</span>
        </Badge>
    );
};
