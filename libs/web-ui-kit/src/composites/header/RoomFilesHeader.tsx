import { cn } from '@chatic/lib/utils';

import { IconBack, IconSearch } from '../../resources/icons';

export interface RoomFilesHeaderProps {
    /** Centred on the screen, whatever the two sides hold (Figma "헤더", 6067:22438). */
    title: string;
    onBack: () => void;
    backLabel?: string;
    /** The search button; omitted, it is not drawn. */
    onSearch?: () => void;
    searchLabel?: string;
    /** The search field it opens is showing. */
    searchActive?: boolean;
    /** The text action at the right edge, e.g. "Select". */
    actionLabel: string;
    onAction: () => void;
    actionDisabled?: boolean;
    /** Adds the status-bar inset above the bar. */
    safeArea?: boolean;
    className?: string;
}

/**
 * The room file list's header (Figma 6067:22438): back on the left, the title centred on the screen, and on
 * the right a search icon beside a text action. 56px tall; the right group sits 16px from the edge with 12px
 * between its two parts, the back button 8px from the left.
 *
 * The title is laid over the bar rather than between the sides, so it stays centred although the right side
 * is wider than the left; it truncates before it reaches either.
 */
export const RoomFilesHeader = ({
    title,
    onBack,
    backLabel = 'Back',
    onSearch,
    searchLabel = 'Search',
    searchActive = false,
    actionLabel,
    onAction,
    actionDisabled = false,
    safeArea = true,
    className,
}: RoomFilesHeaderProps) => (
    <header className={cn('relative w-full shrink-0 bg-background', safeArea && 'pt-[var(--safe-top,0px)]', className)}>
        <div className="relative flex h-14 items-center justify-between pl-2 pr-4">
            <button
                type="button"
                onClick={onBack}
                aria-label={backLabel}
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-opacity active:opacity-60"
            >
                <IconBack className="size-6" />
            </button>
            {/* 96px kept clear on each side: the right group's width plus its inset. */}
            <h1 className="pointer-events-none absolute inset-x-[96px] truncate text-center text-[17px] font-semibold leading-normal text-foreground">
                {title}
            </h1>
            <div className="flex shrink-0 items-center gap-3">
                {onSearch && (
                    <button
                        type="button"
                        onClick={onSearch}
                        aria-label={searchLabel}
                        aria-pressed={searchActive}
                        // A 24px glyph with a 40px target around it, so the group keeps the design's spacing.
                        className="relative flex size-6 items-center justify-center text-foreground transition-opacity before:absolute before:-inset-2 active:opacity-60"
                    >
                        <IconSearch className="size-6" />
                    </button>
                )}
                <button
                    type="button"
                    onClick={onAction}
                    disabled={actionDisabled}
                    className="relative whitespace-nowrap text-[15px] font-semibold leading-normal text-foreground transition-opacity before:absolute before:-inset-x-2 before:-inset-y-3 active:opacity-60 disabled:opacity-40"
                >
                    {actionLabel}
                </button>
            </div>
        </div>
    </header>
);
