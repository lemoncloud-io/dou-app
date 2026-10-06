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
    /** Makes the whole card a button and adds a trailing chevron after the title. */
    onClick?: () => void;
    className?: string;
}

/**
 * Subscription status banner — the Figma "subscription status banner" card at the top of the
 * subscription screens: an icon and title, a tone-coloured description, and an optional D-day chip.
 *
 * The chevron is the visual promise that the card goes somewhere, so it is drawn only when
 * `onClick` is passed; without it the banner is a plain, non-interactive section.
 */
export const StatusBanner = ({
    icon,
    title,
    description,
    tone = 'info',
    chip,
    onClick,
    className,
}: StatusBannerProps) => {
    const rootClassName = cn(
        'flex w-full flex-col gap-3 rounded-[16px] bg-card px-4 py-5 text-left',
        'shadow-[0_2px_6px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none',
        onClick && 'active:bg-muted/50',
        className
    );

    // Spans rather than divs throughout: the root may be a <button>, which only takes phrasing content.
    const content = (
        <>
            <span className="flex w-full items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center">{icon}</span>
                {/* Figma navy #1C274C has no token. `brand-ink` is a navy too, but it stays navy in
                    dark mode, where it would vanish on the dark card — so dark falls back to the
                    theme foreground. */}
                <span className="min-w-0 flex-1 text-[16px] font-semibold leading-[1.44] tracking-[-0.08px] text-[#1C274C] dark:text-foreground">
                    {title}
                </span>
                {onClick && <IconChevronRight aria-hidden className="size-6 shrink-0 text-description" />}
            </span>
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
        </>
    );

    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={rootClassName}>
                {content}
            </button>
        );
    }

    return <section className={rootClassName}>{content}</section>;
};
