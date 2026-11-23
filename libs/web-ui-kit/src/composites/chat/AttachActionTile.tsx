import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface AttachActionTileProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
}

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
