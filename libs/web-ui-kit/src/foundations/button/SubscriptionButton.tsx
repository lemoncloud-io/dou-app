import * as React from 'react';

import { OutlineButton, type OutlineButtonProps } from './OutlineButton';
import { subscriptionTierIcon, subscriptionTierLabel, type SubscriptionTier } from './SubscriptionBadge';

export interface SubscriptionButtonProps extends Omit<OutlineButtonProps, 'icon' | 'accent' | 'children' | 'size'> {
    /** Subscription tier — drives the icon, accent and default label. */
    tier: SubscriptionTier;
    /** Overrides the default label (FREE / PRO). */
    label?: string;
}

/**
 * Subscription tier button — the header FREE / PRO control, built on
 * OutlineButton. PRO uses the accent (green) outline + a bolt glyph; FREE uses
 * the neutral outline + a sparkles glyph. Interactive (routes to subscription).
 *
 * For the same pill as a non-interactive marker — notably inside another button, where a nested
 * `<button>` would be invalid — use {@link SubscriptionBadge}. Both take their glyph and label from
 * the same helpers so they cannot disagree.
 */
export const SubscriptionButton = React.forwardRef<HTMLButtonElement, SubscriptionButtonProps>(
    ({ tier, label, ...props }, ref) => (
        <OutlineButton ref={ref} accent={tier === 'pro'} icon={subscriptionTierIcon(tier)} {...props}>
            {label ?? subscriptionTierLabel(tier)}
        </OutlineButton>
    )
);
SubscriptionButton.displayName = 'SubscriptionButton';
