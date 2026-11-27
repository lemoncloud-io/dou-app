import * as React from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@chatic/ui-kit/components/ui/dropdown-menu';

import { cn } from '@chatic/ui-kit';

import {
    CloudAvatar,
    DefaultAvatar,
    BrandMark,
    SubscriptionBadgeSkeleton,
    SubscriptionButton,
} from '@chatic/design-system-components-mobile';
import { IconChevronDown, IconSearch } from '@chatic/design-system-assets/icons';

export interface AppHeaderProps {
    kind?: 'no-cloud' | 'cloud';
    logo?: React.ReactNode;
    cloudAvatar?: React.ReactNode;
    name?: string;
    subName?: string;
    loading?: boolean;
    loadingLabel?: string;
    onSwitcher?: () => void;
    switcherDot?: boolean;
    switcherMenu?: React.ReactNode;
    planTier?: 'free' | 'pro';
    planLoading?: boolean;
    onPlanClick?: () => void;
    onSearch?: () => void;
    avatar?: React.ReactNode;
    onProfile?: () => void;
    trailing?: React.ReactNode;
    switcherLabel?: string;
    searchLabel?: string;
    profileLabel?: string;
    safeArea?: boolean;
    className?: string;
}

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
    planLoading = false,
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
    const isLoading = loading && kind === 'cloud';
    const left = isLoading ? (
        <span role="status" aria-label={loadingLabel} className="flex min-w-0 items-center gap-2">
            <span className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
            <span className="h-[18px] w-28 animate-pulse rounded bg-muted" />
        </span>
    ) : kind === 'cloud' ? (
        <>
            <span className="size-9 shrink-0 overflow-hidden rounded-full border border-input-border bg-muted">
                {cloudAvatar ?? <CloudAvatar name={name ?? ''} size="sm" />}
            </span>
            <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-0.5">
                    <span className="truncate text-[16px] font-semibold leading-[25px] tracking-[-0.5px] text-notify-name">
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

    const rightAvatar = avatar ?? <DefaultAvatar size={36} />;

    return (
        <header
            className={cn(
                'flex w-full items-center justify-between bg-surface px-4 pb-2',
                safeArea
                    ? 'min-h-[calc(var(--safe-top,0px)+4rem)] pt-[calc(var(--safe-top,0px)+0.5rem)]'
                    : 'min-h-16 pt-2',
                className
            )}
        >
            {leftCluster}

            <div className="flex shrink-0 items-center gap-2">
                {planTier ? (
                    <SubscriptionButton tier={planTier} onClick={onPlanClick} />
                ) : (
                    planLoading && <SubscriptionBadgeSkeleton />
                )}
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
