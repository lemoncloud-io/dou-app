import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconAlert, IconChevronRight } from '../../resources/icons';

export type ProductStatusTone = 'active' | 'scheduled' | 'ended' | 'danger';

export interface ProductCardProps {
    /** Product name. Truncates on one line so the status label keeps its place. */
    name: string;
    /** Leading tier pill — hosts pass `<PlanBadge label="PRO" accent icon={<IconBoltSolid />} />`. */
    badge?: React.ReactNode;
    /** Right-aligned status text ("In use", "Scheduled", "Ended"). */
    statusLabel?: string;
    /**
     * Status colour: `active` point blue · `scheduled` warning orange · `ended` grey ·
     * `danger` destructive red.
     */
    statusTone?: ProductStatusTone;
    /** Grey note under the name, led by a small alert glyph (e.g. the renewal date). */
    caption?: string;
    /** Makes the header row a button and adds a trailing chevron after the status label. */
    onClick?: () => void;
    /** Rendered under an inset divider inside the same card — nested key/value rows, a CTA. */
    children?: React.ReactNode;
    className?: string;
}

/**
 * `--warning` is declared by `apps/web` but not by this kit's `tokens.css`, so the fallback keeps
 * the colour in Storybook too. Kept identical to `KeyValueRows`' warning tone.
 */
const WARNING_TEXT = 'text-[hsl(var(--warning,38_92%_50%))]';

const STATUS_TONE_CLASS: Record<ProductStatusTone, string> = {
    active: 'text-point-blue',
    scheduled: WARNING_TEXT,
    ended: 'text-description',
    danger: 'text-destructive',
};

/**
 * Current / selected product card — the Figma "current product" card on the subscription screens:
 * a tier badge, the product name and a status label, an optional caption, and an optional body
 * (`children`) under a divider.
 *
 * Only the header row becomes a button with `onClick`, never the whole card: `children` may carry
 * its own CTA, and a button cannot nest inside another.
 */
export const ProductCard = ({
    name,
    badge,
    statusLabel,
    statusTone = 'active',
    caption,
    onClick,
    children,
    className,
}: ProductCardProps) => {
    const headerContent = (
        <>
            {badge && <span className="flex shrink-0 items-center">{badge}</span>}
            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[1.3] tracking-[-0.08px] text-foreground">
                {name}
            </span>
            {statusLabel && (
                // Capped so a long label can never squeeze the name to nothing at a 320px column.
                <span
                    className={cn(
                        'max-w-[45%] shrink-0 truncate text-right text-[16px] font-semibold leading-[1.3] tracking-[-0.08px]',
                        STATUS_TONE_CLASS[statusTone]
                    )}
                >
                    {statusLabel}
                </span>
            )}
            {onClick && <IconChevronRight aria-hidden className="size-[18px] shrink-0 text-description" />}
        </>
    );

    const headerClassName = 'flex w-full items-center gap-2 text-left';

    return (
        <div
            className={cn(
                'flex w-full flex-col rounded-[18px] bg-card px-0.5 py-2',
                'shadow-[0_2px_6px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none',
                className
            )}
        >
            <div className="flex flex-col gap-4 px-4 py-3">
                {onClick ? (
                    <button type="button" onClick={onClick} className={cn(headerClassName, 'active:opacity-70')}>
                        {headerContent}
                    </button>
                ) : (
                    <div className={headerClassName}>{headerContent}</div>
                )}
                {caption && (
                    <div className="flex items-start gap-1">
                        <IconAlert aria-hidden className="mt-px size-[18px] shrink-0 text-description" />
                        {/* Figma BK_500 (#9FA2A7) is one step lighter than `description` (BK_600) and
                            sits under 3:1 on white; the token keeps the caption readable. */}
                        <span className="min-w-0 text-[14px] font-medium leading-[1.4] tracking-[-0.07px] text-description">
                            {caption}
                        </span>
                    </div>
                )}
            </div>
            {children && (
                <>
                    <div aria-hidden className="mx-4 h-px bg-secondary" />
                    {children}
                </>
            )}
        </div>
    );
};
