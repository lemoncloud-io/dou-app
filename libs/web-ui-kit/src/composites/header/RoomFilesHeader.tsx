import { cn } from '@chatic/ui-kit';

import { IconBack, IconSearch } from '../../resources/icons';

export interface RoomFilesHeaderProps {
    title: string;
    onBack: () => void;
    backLabel?: string;
    onSearch?: () => void;
    searchLabel?: string;
    searchActive?: boolean;
    actionLabel: string;
    onAction: () => void;
    actionDisabled?: boolean;
    safeArea?: boolean;
    className?: string;
}

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
