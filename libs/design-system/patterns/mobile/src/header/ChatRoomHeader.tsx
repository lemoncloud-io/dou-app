import * as React from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@chatic/ui-kit/components/ui/dropdown-menu';

import { cn } from '@chatic/ui-kit';

import { DefaultAvatar } from '@chatic/design-system-components-mobile';
import { IconBack, IconMore } from '@chatic/design-system-assets/icons';
import { HeaderGlass } from './HeaderGlass';

export interface ChatRoomHeaderProps {
    kind?: 'direct' | 'group' | 'self';
    title?: string;
    avatar?: React.ReactNode;
    hideAvatar?: boolean;
    meta?: React.ReactNode;
    onBack?: () => void;
    onMore?: () => void;
    moreMenu?: React.ReactNode;
    backLabel?: string;
    moreLabel?: string;
    safeArea?: boolean;
    loading?: boolean;
    onIdentityClick?: () => void;
    identityLabel?: string;
    onMetaClick?: () => void;
    metaLabel?: string;
    className?: string;
}

const SLOT = 'flex size-11 shrink-0 items-center justify-center';
const IDENTITY = 'flex min-w-0 flex-1 items-center gap-2 px-1';

export const ChatRoomHeader = ({
    kind = 'group',
    title,
    avatar,
    hideAvatar = false,
    meta,
    onBack,
    onMore,
    moreMenu,
    backLabel = 'Back',
    moreLabel = 'More',
    safeArea = true,
    loading = false,
    onIdentityClick,
    identityLabel,
    onMetaClick,
    metaLabel,
    className,
}: ChatRoomHeaderProps) => {
    const fallbackVariant = kind === 'group' ? 'group' : 'user';

    const moreButton = (
        <button type="button" onClick={moreMenu ? undefined : onMore} aria-label={moreLabel} className={SLOT}>
            <IconMore className="size-[26px] text-foreground" />
        </button>
    );

    const metaNode =
        !loading && meta ? (
            onMetaClick && !onIdentityClick ? (
                <button
                    type="button"
                    onClick={onMetaClick}
                    aria-label={metaLabel}
                    className="min-w-0 self-start text-left"
                >
                    {meta}
                </button>
            ) : (
                <span className="block min-w-0">{meta}</span>
            )
        ) : null;

    const identity = (
        <>
            {hideAvatar ? null : loading ? (
                <span className="block size-[42px] shrink-0 animate-pulse rounded-full bg-muted" />
            ) : (
                (avatar ?? <DefaultAvatar size={42} variant={fallbackVariant} />)
            )}
            <span className="flex min-w-0 flex-1 flex-col">
                {loading ? (
                    <span className="flex h-[26px] items-center">
                        <span className="block h-4 w-32 animate-pulse rounded bg-muted" />
                    </span>
                ) : (
                    <span className="block min-w-0 truncate text-[16px] font-semibold leading-[26px] tracking-[-0.08px] text-foreground">
                        {title}
                    </span>
                )}
                {metaNode}
            </span>
        </>
    );

    return (
        <header
            className={cn(
                'relative flex w-full flex-col bg-white/[0.32] px-1.5 pb-2 dark:bg-black/[0.32]',
                safeArea ? 'pt-[calc(var(--safe-top,0px)+0.5rem)]' : 'pt-2',
                className
            )}
        >
            <HeaderGlass />

            <div className="relative flex w-full items-center justify-between">
                <div className={SLOT}>
                    {onBack && (
                        <button type="button" onClick={onBack} aria-label={backLabel} className={SLOT}>
                            <IconBack className="size-[26px] text-foreground" />
                        </button>
                    )}
                </div>

                {onIdentityClick && !loading ? (
                    <button
                        type="button"
                        onClick={onIdentityClick}
                        aria-label={identityLabel}
                        className={cn(IDENTITY, 'text-left')}
                    >
                        {identity}
                    </button>
                ) : (
                    <div className={IDENTITY}>{identity}</div>
                )}

                <div className={SLOT}>
                    {moreMenu ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>{moreButton}</DropdownMenuTrigger>
                            <DropdownMenuContent align="end">{moreMenu}</DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        onMore && moreButton
                    )}
                </div>
            </div>
        </header>
    );
};
