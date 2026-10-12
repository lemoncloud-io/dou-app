import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface AttachActionTileProps {
    /** The 32px glyph, already coloured by the caller. */
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
}

/**
 * One entry point in the chat attach panel (Figma `3749:28533`): a 54px circle on the light control
 * surface holding a 32px glyph, with the label below.
 */
export const AttachActionTile = ({ icon, label, onClick, disabled = false, className }: AttachActionTileProps) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
            'flex w-[88px] flex-col items-center gap-3 px-3 py-2 transition-opacity active:opacity-70 disabled:opacity-40',
            className
        )}
    >
        <span className="flex size-[54px] items-center justify-center rounded-full bg-control-surface">{icon}</span>
        <span className="w-full truncate text-center text-[15px] font-medium leading-[1.294] tracking-[-0.075px] text-foreground">
            {label}
        </span>
    </button>
);
