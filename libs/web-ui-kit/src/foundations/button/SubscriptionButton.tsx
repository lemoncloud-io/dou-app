import * as React from 'react';

import { IconBolt, IconPlan } from '../../resources/icons';
import { OutlineButton, type OutlineButtonProps } from './OutlineButton';

export interface SubscriptionButtonProps extends Omit<OutlineButtonProps, 'icon' | 'accent' | 'children' | 'size'> {
    /** Subscription tier — drives the icon, accent and default label. */
    tier: 'free' | 'pro';
    /** Overrides the default label (FREE / PRO). */
    label?: string;
}

/**
 * Subscription tier button — the header FREE / PRO control, built on
 * OutlineButton. PRO uses the accent (green) outline + a bolt glyph; FREE uses
 * the neutral outline + a sparkles glyph. Interactive (routes to subscription).
 */
export const SubscriptionButton = React.forwardRef<HTMLButtonElement, SubscriptionButtonProps>(
    ({ tier, label, ...props }, ref) => {
        const pro = tier === 'pro';
        return (
            <OutlineButton
                ref={ref}
                accent={pro}
                icon={pro ? <IconBolt className="size-4" /> : <IconPlan className="size-4" />}
                {...props}
            >
                {label ?? (pro ? 'PRO' : 'FREE')}
            </OutlineButton>
        );
    }
);
SubscriptionButton.displayName = 'SubscriptionButton';
