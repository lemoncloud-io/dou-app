import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconBoltSolid, IconStarsSolid } from '../../resources/icons';
import { buttonSurfaceClass } from './Button';

export type SubscriptionTier = 'free' | 'pro';

export const subscriptionTierIcon = (tier: SubscriptionTier): React.ReactNode =>
    tier === 'pro' ? <IconBoltSolid className="size-4" /> : <IconStarsSolid className="size-4" />;

export const subscriptionTierLabel = (tier: SubscriptionTier): string => (tier === 'pro' ? 'PRO' : 'FREE');

const XS_TIER_CLASS = {
    pro: 'gap-0.5 bg-background px-2',
    free: '',
} as const;

export interface SubscriptionBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    tier: SubscriptionTier;
    label?: string;
    size?: 'sm' | 'xs';
}

export const SubscriptionBadge = React.forwardRef<HTMLSpanElement, SubscriptionBadgeProps>(
    ({ tier, label, size = 'sm', className, ...props }, ref) => (
        <span
            ref={ref}
            className={cn(
                buttonSurfaceClass({ variant: 'outline', tone: tier === 'pro' ? 'green' : 'gray', size }),
                'shrink-0',
                size === 'xs' && XS_TIER_CLASS[tier],
                className
            )}
            {...props}
        >
            {subscriptionTierIcon(tier)}
            {label ?? subscriptionTierLabel(tier)}
        </span>
    )
);
SubscriptionBadge.displayName = 'SubscriptionBadge';

export interface SubscriptionBadgeSkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
    size?: 'sm' | 'xs';
}

export const SubscriptionBadgeSkeleton = React.forwardRef<HTMLSpanElement, SubscriptionBadgeSkeletonProps>(
    ({ size = 'sm', className, ...props }, ref) => (
        <span
            ref={ref}
            aria-hidden
            className={cn(
                buttonSurfaceClass({ variant: 'outline', size }),
                'shrink-0 animate-pulse border-transparent bg-muted',
                size === 'xs' && XS_TIER_CLASS.free,
                className
            )}
            {...props}
        >
            <span className="invisible contents">
                {subscriptionTierIcon('free')}
                {subscriptionTierLabel('free')}
            </span>
        </span>
    )
);
SubscriptionBadgeSkeleton.displayName = 'SubscriptionBadgeSkeleton';
