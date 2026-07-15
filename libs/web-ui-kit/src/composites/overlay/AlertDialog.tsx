import * as React from 'react';

import {
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialog as Root,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

import { cn } from '@chatic/lib/utils';

export interface AlertDialogProps {
    /** Controls visibility. */
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Bold centered title. */
    title: React.ReactNode;
    /** Optional supporting message below the title. */
    description?: React.ReactNode;
    /** Left (dismiss) button label. */
    cancelLabel?: string;
    /** Right (confirm) button label. */
    confirmLabel: string;
    onConfirm: () => void;
    onCancel?: () => void;
    /** Renders the confirm action in the destructive (red) color. */
    destructive?: boolean;
}

const ACTION =
    'flex h-[52px] flex-1 items-center justify-center border-t border-input-border px-2 text-[16px] font-semibold leading-[1.5] tracking-[-0.08px] transition-colors';

/**
 * Centered confirmation dialog — the Figma "dialogue" design system: a compact
 * card with a title, optional description, and a two-up split action row
 * (dismiss / confirm). Built on the shared Radix AlertDialog primitives; the
 * confirm action can be styled destructive. Focus/escape/overlay are handled by
 * the primitive.
 */
export const AlertDialog = ({
    open,
    onOpenChange,
    title,
    description,
    cancelLabel = 'Cancel',
    confirmLabel,
    onConfirm,
    onCancel,
    destructive = false,
}: AlertDialogProps) => {
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
            <AlertDialogContent className="flex w-[311px] max-w-[calc(100vw-3rem)] flex-col gap-0 overflow-hidden rounded-[12px] border-0 bg-surface p-0 pt-[22px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] sm:rounded-[12px]">
                <div className="flex w-full flex-col gap-[22px]">
                    <div className="flex flex-col gap-2 px-[22px] text-center">
                        <AlertDialogTitle className="text-[18px] font-semibold leading-[1.5] text-foreground">
                            {title}
                        </AlertDialogTitle>
                        {description && (
                            <AlertDialogDescription className="text-[16px] font-medium leading-[1.45] tracking-[-0.08px] text-description">
                                {description}
                            </AlertDialogDescription>
                        )}
                    </div>

                    <div className="flex w-full">
                        <AlertDialogCancel asChild>
                            <button type="button" onClick={handleCancel} className={cn(ACTION, 'border-r text-label')}>
                                {cancelLabel}
                            </button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                className={cn(ACTION, destructive ? 'text-destructive' : 'text-foreground')}
                            >
                                {confirmLabel}
                            </button>
                        </AlertDialogAction>
                    </div>
                </div>
            </AlertDialogContent>
        </Root>
    );
};
