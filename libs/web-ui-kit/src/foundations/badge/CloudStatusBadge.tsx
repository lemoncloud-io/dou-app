import { cn } from '@chatic/lib/utils';

import { IconAlert } from '../../resources/icons';

export type CloudStatusVariant = 'provisioning' | 'failed' | 'ending' | 'restricted';

export interface CloudStatusBadgeProps {
    /** Localized state word — the host supplies it, the badge only paints it. */
    label: string;
    /**
     * provisioning = being created (blue) · failed = needs a look (red) · ending = scheduled to end
     * at the next renewal (orange) · restricted = held by the relay (grey, with an alert glyph).
     */
    variant: CloudStatusVariant;
    className?: string;
}

/**
 * Tints are arbitrary `hsl(var(--token)/0.08)` values rather than `bg-token/[0.08]`: the kit's
 * colours are declared as `hsl(var(--x))` without `<alpha-value>`, so the opacity modifier has
 * nothing to splice into. `--warning` is declared by `apps/web` but not by this kit's `tokens.css`,
 * so the fallback keeps the colour in Storybook too — the same value `ProductCard` uses.
 */
const VARIANT_CLASS: Record<CloudStatusVariant, string> = {
    provisioning: 'bg-[hsl(var(--point-blue)/0.08)] text-point-blue',
    failed: 'bg-[hsl(var(--destructive)/0.08)] text-destructive',
    ending: 'bg-[hsl(var(--warning,38_92%_50%)/0.08)] text-[hsl(var(--warning,38_92%_50%))]',
    restricted: 'bg-secondary text-description',
};

/**
 * Cloud state pill — the Figma "DoU/Status Badge" (4896:15155) that trails a cloud row in the
 * switcher and in cloud management: a 12px word on a translucent tint of its own colour. Unlike
 * `StatusBadge` (role pills: owner / MY) it is square-cornered, and the restricted variant leads
 * with an alert glyph because its grey tint alone does not read as a warning.
 */
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
