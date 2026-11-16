import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { BottomSheet } from './BottomSheet';

/** One row of the sheet. */
export interface RoomFileMoreAction {
    key: string;
    label: string;
    onPress: () => void;
    /** Drawn in the alert colour — Delete. */
    destructive?: boolean;
    /** Optional leading glyph. The design draws text-only rows; a host may still add one. */
    icon?: React.ReactNode;
}

export interface RoomFileMoreSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The file's name, drawn at the head of the sheet and used as its accessible name. */
    name: string;
    /** The line under the name — "sender · date · length · size", formatted by the host. */
    meta?: string;
    /**
     * The rows, top to bottom. Which ones exist (Details, View in chat, Save, Share, Delete) and in
     * what order is the host's decision; the sheet only draws them.
     */
    actions: readonly RoomFileMoreAction[];
    className?: string;
}

/**
 * The room file list's ⋮ sheet (Figma "대화방 파일 · 더보기 시트" 6082:23524, variant 6082:23508
 * "종류=일반"): a grabber, the file's name and meta line as a head, a hairline, then the rows.
 *
 * A row closes the sheet after it runs, so whatever it opens next (the detail screen, a confirm
 * dialog) is not stacked under a sheet still standing.
 */
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
                {/* Head (6082:23491). The sheet's accessible name is the hidden title; this copy is
                    for the eye. The top padding clears the grabber the sheet draws over its body. */}
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
