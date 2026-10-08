import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconChevronRight } from '../../resources/icons';

export interface StatusBannerProps {
    /** 24px leading glyph slot. */
    icon: React.ReactNode;
    /** One-line headline beside the icon. */
    title: string;
    /** Supporting line under the title, coloured by `tone`. */
    description: React.ReactNode;
    /** `info` paints the description point blue; `danger` paints it the destructive red. */
    tone?: 'info' | 'danger';
    /** Outlined pill under the description (e.g. "D-3 until it ends"). Omitted when absent. */
    chip?: string;
    /**
     * Makes the card a button and adds a trailing chevron after the title. With `action` set only
     * the title row is the button — a button cannot nest inside another.
     */
    onClick?: () => void;
    /**
     * Full-width dark pill at the foot of the card (e.g. "Choose the clouds to keep"). Rendered as
     * its own button, so the card stays a section around it.
     */
    action?: { label: string; onClick: () => void };
    className?: string;
}

/**
 * Subscription status banner — the Figma "subscription status banner" card at the top of the
 * subscription screens: an icon and title, a tone-coloured description, and an optional D-day chip.
 *
 * The chevron is the visual promise that the card goes somewhere, so it is drawn only when
 * `onClick` is passed; without it the banner is a plain, non-interactive section. An `action`
 * splits the two: the card is a section, the title row carries `onClick` and the pill carries its
 * own — the Figma "subscription status banner" with the inner button (5002:57306).
 */
export const StatusBanner = ({
    icon,
    title,
    description,
    tone = 'info',
    chip,
    onClick,
    action,
    className,
}: StatusBannerProps) => {
    const rootClassName = cn(
        'flex w-full flex-col gap-3 rounded-[16px] bg-card px-4 py-5 text-left',
        'shadow-[0_2px_6px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none',
        onClick && !action && 'active:bg-muted/50',
        className
    );

    // The pill splits the card: the whole card may no longer be the button, so the title row takes
    // `onClick` on its own instead.
    const titleRowClassName = 'flex w-full items-center gap-2 text-left';
    const titleRow = (
        <>
            <span className="flex size-6 shrink-0 items-center justify-center">{icon}</span>
            {/* Figma navy #1C274C has no token. `brand-ink` is a navy too, but it stays navy in
                dark mode, where it would vanish on the dark card — so dark falls back to the
                theme foreground. */}
            <span className="min-w-0 flex-1 text-[16px] font-semibold leading-[1.44] tracking-[-0.08px] text-[#1C274C] dark:text-foreground">
                {title}
            </span>
            {onClick && <IconChevronRight aria-hidden className="size-6 shrink-0 text-description" />}
        </>
    );

    // Spans rather than divs throughout: the root may be a <button>, which only takes phrasing content.
    const content = (
        <>
            {action && onClick ? (
                <button type="button" onClick={onClick} className={cn(titleRowClassName, 'active:opacity-70')}>
                    {titleRow}
                </button>
            ) : (
                <span className={titleRowClassName}>{titleRow}</span>
            )}
            <span
                className={cn(
                    'block text-[14px] font-medium leading-[1.5] tracking-[-0.07px]',
                    tone === 'danger' ? 'text-destructive' : 'text-point-blue'
                )}
            >
                {description}
            </span>
            {chip && (
                // BK_200 outline — `tile-ring` carries exactly that value in both themes.
                <span className="self-start rounded-full border border-tile-ring px-3 py-1.5 text-[14px] font-medium leading-[1.4] tracking-[-0.07px] text-foreground">
                    {chip}
                </span>
            )}
            {action && (
                <button
                    type="button"
                    onClick={action.onClick}
                    className="flex w-full items-center justify-between rounded-full bg-foreground py-4 pl-6 pr-5 text-[15px] font-semibold leading-[1.3] text-background active:opacity-80"
                >
                    {action.label}
                    <IconChevronRight aria-hidden className="size-[18px] shrink-0" />
                </button>
            )}
        </>
    );

    if (onClick && !action) {
        return (
            <button type="button" onClick={onClick} className={rootClassName}>
                {content}
            </button>
        );
    }

    return <section className={rootClassName}>{content}</section>;
};
