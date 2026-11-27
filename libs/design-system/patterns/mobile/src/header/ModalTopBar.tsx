import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconClose } from '@chatic/design-system-assets/icons';
import { HeaderGlass } from './HeaderGlass';

export interface ModalTopBarProps {
    title?: string;
    onClose?: () => void;
    leftSlot?: React.ReactNode;
    rightSlot?: React.ReactNode;
    divider?: boolean;
    closeLabel?: string;
    safeArea?: boolean;
    className?: string;
}

const SLOT = 'flex h-11 w-11 shrink-0 items-center justify-center';

export const ModalTopBar = ({
    title,
    onClose,
    leftSlot,
    rightSlot,
    divider = false,
    closeLabel = 'Close',
    safeArea = true,
    className,
}: ModalTopBarProps) => {
    return (
        <header
            className={cn(
                'relative flex w-full items-center justify-between bg-white/[0.32] px-1.5 pb-2 dark:bg-black/[0.32]',
                safeArea ? 'pt-[calc(var(--safe-top,0px)+0.5rem)]' : 'pt-2',
                divider && 'border-b border-avatar-ring',
                className
            )}
        >
            <HeaderGlass />

            <div className={cn('relative', SLOT)}>{leftSlot}</div>

            <div className="relative flex min-w-0 flex-1 items-center justify-center px-2">
                <p className="truncate text-center text-[16px] font-semibold leading-[26px] tracking-[-0.08px] text-foreground">
                    {title}
                </p>
            </div>

            <div className={cn('relative', SLOT)}>
                {rightSlot ??
                    (onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={closeLabel}
                            className="flex h-11 w-11 items-center justify-center"
                        >
                            <IconClose className="h-[26px] w-[26px] text-foreground" />
                        </button>
                    ))}
            </div>
        </header>
    );
};
