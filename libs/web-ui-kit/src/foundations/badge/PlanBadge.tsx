import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconPlan } from '../../resources/icons';
import { Badge } from './Badge';

export interface PlanBadgeProps {
    label: string;
    icon?: React.ReactNode;
    accent?: boolean;
    className?: string;
}

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
