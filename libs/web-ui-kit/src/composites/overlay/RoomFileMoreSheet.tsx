import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { BottomSheet } from './BottomSheet';

export interface RoomFileMoreAction {
    key: string;
    label: string;
    onPress: () => void;
    destructive?: boolean;
    icon?: React.ReactNode;
}

export interface RoomFileMoreSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    name: string;
    meta?: string;
    actions: readonly RoomFileMoreAction[];
    className?: string;
}

export const RoomFileMoreSheet = ({ open, onOpenChange, name, meta, actions, className }: RoomFileMoreSheetProps) => {
    const run = (action: () => void) => () => {
        action();
        onOpenChange(false);
    };

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={name}
            description={meta}
            hideHeader
            showHandle
            className={className}
        >
            <div className="flex flex-col pb-2">
                <div aria-hidden className="flex flex-col gap-1 px-5 pb-4 pt-7">
                    <p className="line-clamp-2 break-all text-[16px] font-semibold leading-[1.3] text-foreground">
                        {name}
                    </p>
                    {meta && <p className="truncate text-[13px] leading-[1.3] text-description">{meta}</p>}
                </div>
                <div aria-hidden className="h-px w-full bg-input-border" />
                <div className="flex flex-col pt-1.5">
                    {actions.map(action => (
                        <button
                            key={action.key}
                            type="button"
                            onClick={run(action.onPress)}
                            className={cn(
                                'flex h-[52px] w-full items-center gap-2.5 px-5 text-left text-[16px] font-medium leading-[1.2] transition-colors active:bg-action-soft',
                                action.destructive ? 'text-alert-red' : 'text-foreground'
                            )}
                        >
                            {action.icon && (
                                <span aria-hidden className="flex size-6 shrink-0 items-center justify-center">
                                    {action.icon}
                                </span>
                            )}
                            <span className="min-w-0 flex-1 truncate">{action.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </BottomSheet>
    );
};
