import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as React from 'react';

import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialog as Root,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

import { cn } from '@chatic/ui-kit';

export interface UnsendableFile {
    key: string;
    name: string;
    reason: string;
}

export interface UnsendableFilesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: readonly UnsendableFile[];
    restCount: number;
    onSendRest?: () => void;
    onCancel?: () => void;
    onConfirm?: () => void;
    title?: string;
    description?: React.ReactNode;
    sendRestLabel?: string;
    cancelLabel?: string;
    confirmLabel?: string;
    className?: string;
}

const BUTTON =
    'flex h-[46px] min-w-0 flex-1 items-center justify-center rounded-[12px] px-3 text-[15px] font-semibold leading-[1.2] transition-opacity active:opacity-80';

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
