import * as React from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@chatic/ui-kit/components/ui/dropdown-menu';

import { cn } from '@chatic/lib/utils';

import { CloudAvatar } from '../../foundations/avatar/CloudAvatar';
import { DefaultAvatar } from '../../foundations/avatar/DefaultAvatar';
import { BrandMark } from '../../foundations/brand/BrandMark';
import { SubscriptionButton } from '../../foundations/button/SubscriptionButton';
import { IconChevronDown, IconSearch } from '../../resources/icons';

export interface AppHeaderProps {
    /**
     * `no-cloud` (Type 1) = brand mark + switcher chevron on the left.
     * `cloud` (Type 2) = cloud profile avatar + cloud name (+ place nickname) +
     * switcher chevron on the left.
     */
    kind?: 'no-cloud' | 'cloud';
    /** Brand mark node — `no-cloud` kind. Defaults to the theme-aware DoU character+wordmark. */
    logo?: React.ReactNode;
    /**
     * Cloud profile avatar node — `cloud` kind. Falls back to a Slack-style
     * initials avatar (derived from `name`) when the cloud owner hasn't set one.
     */
    cloudAvatar?: React.ReactNode;
    /** Cloud name (line 1) — `cloud` kind. */
    name?: string;
    /** Place nickname (line 2, optional) — `cloud` kind. */
    subName?: string;
    /**
     * The cloud identity is still being fetched — `cloud` kind renders a pulsing placeholder for
     * the avatar and the name instead of an empty row. Without it a cold start shows a blank
     * circle next to blank text, which reads as "this cloud has no name" rather than "loading".
     */
    loading?: boolean;
    /** Accessible label for the loading placeholder. Host supplies a localized string. */
    loadingLabel?: string;
    /** Switcher (cloud/place) handler; renders the chevron and makes the left a button. */
    onSwitcher?: () => void;
    /**
     * Presence dot next to the switcher chevron — something needs attention behind it (e.g. an
     * unread cross-cloud push) that opening the switcher would reveal. Off by default.
     */
    switcherDot?: boolean;
    /**
     * Dropdown content for the switcher (e.g. DropdownMenuItem list). When set,
     * the left cluster becomes a DropdownMenu trigger — the Radix primitive owns
     * the open state, so this component stays stateless.
     */
    switcherMenu?: React.ReactNode;
    /** Subscription tier for the plan badge; omit to hide the badge entirely. */
    planTier?: 'free' | 'pro';
    /** Plan badge tap handler (e.g. navigate to the subscription screen). */
    onPlanClick?: () => void;
    /** Search action handler; renders the search button when set. */
    onSearch?: () => void;
    /**
     * Right-side profile (place) avatar node. Falls back to a default avatar
     * glyph when the place profile doesn't exist.
     */
    avatar?: React.ReactNode;
    /** Profile tap handler; wraps the avatar in a button when set. */
    onProfile?: () => void;
    /**
     * Trailing slot after the avatar for host-specific actions (e.g. an overflow
     * menu). Off-design by default — the Figma header renders nothing here.
     */
    trailing?: React.ReactNode;
    /** Accessible label for the switcher button. Host supplies a localized string. */
    switcherLabel?: string;
    /** Accessible label for the search button. Host supplies a localized string. */
    searchLabel?: string;
    /** Accessible label for the profile button. Host supplies a localized string. */
    profileLabel?: string;
    /** Adds top padding for the status-bar / notch safe-area inset. */
    safeArea?: boolean;
    className?: string;
}

/**
 * Home top header — the Figma "헤더", in two kinds:
 *  - `no-cloud` (Type 1): DoU brand mark + chevron.
 *  - `cloud`    (Type 2): cloud avatar + cloud name (+ place nickname) + chevron.
 * Both share the right cluster: plan badge + search button + profile avatar.
 *
 * Stateless and i18n-agnostic: the switcher/search/profile are exposed as
 * actions (the host owns any dropdown open-state and navigation), and the
 * accessible labels default to English but accept localized strings. Compose the
 * switcher with a DropdownMenu on the host side for the cloud-switch dropdown.
 */
export const AppHeader = ({
    kind = 'no-cloud',
    logo,
    cloudAvatar,
    name,
    subName,
    loading = false,
    loadingLabel = 'Loading',
    onSwitcher,
    switcherDot = false,
    switcherMenu,
    planTier,
    onPlanClick,
    onSearch,
    avatar,
    onProfile,
    trailing,
    switcherLabel = 'Switch',
    searchLabel = 'Search',
    profileLabel = 'Profile',
    safeArea = true,
    className,
}: AppHeaderProps) => {
    const hasSwitcher = !!(onSwitcher || switcherMenu);
    // Only the `cloud` kind can be "loading": the `no-cloud` kind shows the static brand mark,
    // which is known before any fetch.
    const isLoading = loading && kind === 'cloud';
    const left = isLoading ? (
        <span role="status" aria-label={loadingLabel} className="flex min-w-0 items-center gap-2">
            <span className="size-[46px] shrink-0 animate-pulse rounded-full bg-muted" />
            <span className="h-[18px] w-28 animate-pulse rounded bg-muted" />
        </span>
    ) : kind === 'cloud' ? (
        <>
            <span className="size-[46px] shrink-0 overflow-hidden rounded-full bg-muted">
                {cloudAvatar ?? <CloudAvatar name={name ?? ''} size="lg" />}
            </span>
            <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1">
                    <span className="truncate text-[16px] font-medium leading-[25px] tracking-[-0.5px] text-foreground">
                        {name}
                    </span>
                    {hasSwitcher && <IconChevronDown className="size-4 shrink-0 text-foreground" />}
                    {hasSwitcher && switcherDot && <span className="size-1.5 shrink-0 rounded-full bg-red-500" />}
                </span>
                {subName && <span className="truncate text-[13px] leading-4 text-description">{subName}</span>}
            </span>
        </>
    ) : (
        <>
            {logo ?? <BrandMark />}
            {hasSwitcher && <IconChevronDown className="size-4 shrink-0 text-foreground" />}
            {hasSwitcher && switcherDot && <span className="size-1.5 shrink-0 rounded-full bg-red-500" />}
        </>
    );

    const switcherTrigger = (
        <button
            type="button"
            onClick={onSwitcher}
            aria-label={switcherLabel}
            className="flex min-w-0 items-center gap-2"
        >
            {left}
        </button>
    );

    const leftCluster = switcherMenu ? (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>{switcherTrigger}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">{switcherMenu}</DropdownMenuContent>
        </DropdownMenu>
    ) : onSwitcher ? (
        switcherTrigger
    ) : (
        <div className="flex min-w-0 items-center gap-2">{left}</div>
    );

    // Place profile — falls back to a default avatar glyph when the host has
    // none, matching the Figma "empty" profile state.
    const rightAvatar = avatar ?? <DefaultAvatar size={36} />;

    return (
        <header
            className={cn(
                'flex w-full items-center justify-between bg-surface px-4 pb-2',
                // Keep at least the base 8px top padding, plus the safe-area inset.
                safeArea ? 'pt-[calc(var(--safe-top,0px)+0.5rem)]' : 'pt-2',
                className
            )}
        >
            {leftCluster}

            <div className="flex shrink-0 items-center gap-2">
                {planTier && <SubscriptionButton tier={planTier} onClick={onPlanClick} />}
                {onSearch && (
                    <button
                        type="button"
                        onClick={onSearch}
                        aria-label={searchLabel}
                        className="flex size-9 items-center justify-center rounded-full border border-input-border"
                    >
                        <IconSearch className="size-[22px] text-foreground" />
                    </button>
                )}
                {onProfile ? (
                    <button type="button" onClick={onProfile} aria-label={profileLabel} className="flex size-9">
                        {rightAvatar}
                    </button>
                ) : (
                    <div className="flex size-9">{rightAvatar}</div>
                )}
                {trailing}
            </div>
        </header>
    );
};
