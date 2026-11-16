import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as React from 'react';

import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialog as Root,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

import { cn } from '@chatic/ui-kit';

/** One file that cannot be sent, and why. */
export interface UnsendableFile {
    key: string;
    name: string;
    /** Why it was refused, short — its size (`412MB`), or a word like "Unsupported". */
    reason: string;
}

export interface UnsendableFilesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The refused files, each drawn on its own light red panel. */
    items: readonly UnsendableFile[];
    /** How many of the picked files can still be sent. `0` turns the two buttons into one OK. */
    restCount: number;
    /** Send the files that can be sent, without the refused ones. */
    onSendRest?: () => void;
    /** Dismissed with Cancel. */
    onCancel?: () => void;
    /** Acknowledged with the single OK button, when nothing is left to send. */
    onConfirm?: () => void;
    title?: string;
    /** Why the files were refused — the size limit, say. `\n` is a deliberate line break. */
    description?: React.ReactNode;
    /** The send button's label. Defaults to "Send the other {restCount}". */
    sendRestLabel?: string;
    cancelLabel?: string;
    confirmLabel?: string;
    className?: string;
}

const BUTTON =
    'flex h-[46px] min-w-0 flex-1 items-center justify-center rounded-[12px] px-3 text-[15px] font-semibold leading-[1.2] transition-opacity active:opacity-80';

/**
 * The notice shown when some of the files picked to send are refused
 * (Figma "음성 파일 · 보낼 수 없는 파일 팝업" 6072:23076; screen 6044:23592): a title, why, the
 * refused files on light red panels, then Cancel and "Send the other n". When nothing is left to send there is no choice to make, so
 * the two buttons become a single OK.
 *
 * Built on the same Radix alert dialog as `AlertDialog` rather than on `AlertDialog` itself: the file
 * list sits between the copy and the buttons, and the buttons are filled pills rather than that
 * dialog's split row. Like it, it uses the raw Radix `Cancel` / `Action` nodes, because `ui-kit`'s
 * styled wrappers inject classes through a `Slot` that concatenates instead of merging them.
 */
export const UnsendableFilesDialog = ({
    open,
    onOpenChange,
    items,
    restCount,
    onSendRest,
    onCancel,
    onConfirm,
    title = 'Some files can’t be sent',
    description,
    sendRestLabel,
    cancelLabel = 'Cancel',
    confirmLabel = 'OK',
    className,
}: UnsendableFilesDialogProps) => {
    const canSendRest = restCount > 0;
    const finish = (action?: () => void) => () => {
        action?.();
        onOpenChange(false);
    };

    return (
        <Root open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent
                // Radix links its own Description automatically, but warns when there is none; opt out
                // explicitly only when nothing is drawn.
                {...(description ? {} : { 'aria-describedby': undefined })}
                className={cn(
                    'flex flex-col gap-2 overflow-hidden rounded-[16px] border-0 bg-surface px-5 pb-5 pt-6 shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] sm:rounded-[16px]',
                    className
                )}
            >
                <AlertDialogTitle className="text-[17px] font-semibold leading-[1.3] text-foreground">
                    {title}
                </AlertDialogTitle>
                {description && (
                    <AlertDialogDescription className="whitespace-pre-line text-[14px] leading-[1.5] text-description">
                        {description}
                    </AlertDialogDescription>
                )}

                {items.length > 0 && (
                    // A long batch scrolls inside the dialog rather than pushing the buttons off screen.
                    <ul className="flex max-h-[176px] flex-col gap-1.5 overflow-y-auto">
                        {items.map(item => (
                            <li
                                key={item.key}
                                className="flex items-center gap-2 rounded-[10px] bg-alert-red/[0.07] px-3 py-2.5 text-[13px] font-semibold leading-[1.2]"
                            >
                                <span className="min-w-0 flex-1 truncate text-foreground">{item.name}</span>
                                <span className="shrink-0 text-alert-red">{item.reason}</span>
                            </li>
                        ))}
                    </ul>
                )}

                {/* The design's 8px spacer, on top of the column's gap. */}
                <div aria-hidden className="h-2 shrink-0" />

                <div className="flex w-full gap-2">
                    {canSendRest ? (
                        <>
                            <AlertDialogPrimitive.Cancel asChild>
                                <button
                                    type="button"
                                    onClick={finish(onCancel)}
                                    className={cn(BUTTON, 'bg-action-soft text-foreground')}
                                >
                                    {cancelLabel}
                                </button>
                            </AlertDialogPrimitive.Cancel>
                            <AlertDialogPrimitive.Action asChild>
                                <button
                                    type="button"
                                    onClick={finish(onSendRest)}
                                    className={cn(BUTTON, 'bg-brand-ink text-bubble-mine-foreground')}
                                >
                                    <span className="truncate">{sendRestLabel ?? `Send the other ${restCount}`}</span>
                                </button>
                            </AlertDialogPrimitive.Action>
                        </>
                    ) : (
                        <AlertDialogPrimitive.Action asChild>
                            <button
                                type="button"
                                onClick={finish(onConfirm)}
                                className={cn(BUTTON, 'bg-brand-ink text-bubble-mine-foreground')}
                            >
                                {confirmLabel}
                            </button>
                        </AlertDialogPrimitive.Action>
                    )}
                </div>
            </AlertDialogContent>
        </Root>
    );
};
