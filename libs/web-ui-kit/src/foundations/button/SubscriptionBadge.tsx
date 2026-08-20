import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconBoltSolid, IconStarsSolid } from '../../resources/icons';
import { buttonSurfaceClass } from './Button';

export type SubscriptionTier = 'free' | 'pro';

/** Glyph + default label for a tier — shared so the badge and the button cannot say different things. */
export const subscriptionTierIcon = (tier: SubscriptionTier): React.ReactNode =>
    tier === 'pro' ? <IconBoltSolid className="size-4" /> : <IconStarsSolid className="size-4" />;

export const subscriptionTierLabel = (tier: SubscriptionTier): string => (tier === 'pro' ? 'PRO' : 'FREE');

/**
 * Per-tier trim for the in-menu (`xs`) pill. The two Figma components differ by a hair — PRO packs
 * its glyph 2px from the label on an opaque ground (`2870:20411`), FREE breathes 4px and carries the
 * extra pixel on the right (`4135:24750`) — so both are reproduced instead of averaged.
 */
const XS_TIER_CLASS = {
    pro: 'gap-0.5 bg-background px-2',
    free: '',
} as const;

export interface SubscriptionBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Subscription tier — drives the icon, accent and default label. */
    tier: SubscriptionTier;
    /** Overrides the default label (FREE / PRO). */
    label?: string;
    /** `sm` matches the header control; `xs` is the tighter pill used inside dropdown rows. */
    size?: 'sm' | 'xs';
}

/**
 * The non-interactive twin of {@link SubscriptionButton} — same pill, rendered as a `<span>`.
 *
 * Exists because the tier pill sometimes appears INSIDE another button (the cloud switcher's
 * "＋ 클라우드 추가" pill, Figma 3769:34789): a `<button>` nested in a `<button>` is invalid HTML and
 * carves a dead zone out of the parent's tap target. Its surface classes and its glyph/label both
 * come from the same source as the button's, so the two cannot drift apart.
 *
 * Use it for a tier MARKER — "this is a PRO feature" — and `SubscriptionButton` when the pill is the
 * control that routes to subscription. A marker takes no membership state: it says what the feature
 * costs, not what the viewer has.
 *
 * `aria-hidden` is deliberately NOT applied: the paid-feature signal is information, not decoration,
 * so it joins the parent button's accessible name.
 */
export const SubscriptionBadge = React.forwardRef<HTMLSpanElement, SubscriptionBadgeProps>(
    ({ tier, label, size = 'sm', className, ...props }, ref) => (
        <span
            ref={ref}
            className={cn(
                buttonSurfaceClass({ variant: 'outline', accent: tier === 'pro', size }),
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
