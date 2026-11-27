import * as React from 'react';

import { OutlineButton, type OutlineButtonProps } from './OutlineButton';
import { subscriptionTierIcon, subscriptionTierLabel, type SubscriptionTier } from './SubscriptionBadge';

export interface SubscriptionButtonProps extends Omit<OutlineButtonProps, 'icon' | 'tone' | 'children' | 'size'> {
    tier: SubscriptionTier;
    label?: string;
}

export const SubscriptionButton = React.forwardRef<HTMLButtonElement, SubscriptionButtonProps>(
    ({ tier, label, ...props }, ref) => (
        <OutlineButton ref={ref} tone={tier === 'pro' ? 'green' : 'gray'} icon={subscriptionTierIcon(tier)} {...props}>
            {label ?? subscriptionTierLabel(tier)}
        </OutlineButton>
    )
);
SubscriptionButton.displayName = 'SubscriptionButton';
