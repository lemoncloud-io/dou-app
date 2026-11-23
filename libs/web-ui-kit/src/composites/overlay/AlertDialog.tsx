import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as React from 'react';

import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialog as Root,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

import { cn } from '@chatic/ui-kit';

export interface AlertDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: React.ReactNode;
    description?: React.ReactNode;
    cancelLabel?: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel?: () => void;
    destructive?: boolean;
}

const ACTION =
    'flex h-[52px] flex-1 items-center justify-center border-t border-input-border px-2 text-[16px] font-semibold leading-[1.5] tracking-[-0.08px] transition-colors';

export const AlertDialog = ({
    open,
    onOpenChange,
    title,
    description,
    cancelLabel,
    confirmLabel,
    onConfirm,
    onCancel,
    destructive = false,
}: AlertDialogProps) => {
    const hasCancel = cancelLabel !== undefined;
    const handleCancel = () => {
        onCancel?.();
        onOpenChange(false);
    };

    const handleConfirm = () => {
        onConfirm();
        onOpenChange(false);
    };

    return (
        <Root open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="flex flex-col gap-0 overflow-hidden rounded-[12px] border-0 bg-surface p-0 pt-[22px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] sm:rounded-[12px]">
                <div className="flex w-full flex-col gap-[22px]">
                    <div className="flex flex-col gap-2 px-[22px] text-center">
                        <AlertDialogTitle className="text-[18px] font-semibold leading-[1.5] text-foreground">
                            {title}
                        </AlertDialogTitle>
                        {description && (
                            <AlertDialogDescription className="whitespace-pre-line text-[16px] font-medium leading-[1.45] tracking-[-0.08px] text-description">
                                {description}
                            </AlertDialogDescription>
                        )}
                    </div>

                    <div className="flex w-full">
                        {hasCancel && (
                            <AlertDialogPrimitive.Cancel asChild>
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className={cn(ACTION, 'border-r text-label')}
                                >
                                    {cancelLabel}
                                </button>
                            </AlertDialogPrimitive.Cancel>
                        )}
                        <AlertDialogPrimitive.Action asChild>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                className={cn(ACTION, destructive ? 'text-destructive' : 'text-foreground')}
                            >
                                {confirmLabel}
                            </button>
                        </AlertDialogPrimitive.Action>
                    </div>
                </div>
            </AlertDialogContent>
        </Root>
    );
};
