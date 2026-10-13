import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

/**
 * How the place dialogs set Korean text. A line break in the copy is kept, and a line wraps between
 * words, never inside one — Korean otherwise breaks at any syllable ("채팅방에 / 서도"). A single run
 * with no space that still does not fit (a long name) may break anywhere rather than push the card
 * wider than the screen.
 */
export const PLACE_DIALOG_TEXT = 'whitespace-pre-line break-keep [overflow-wrap:anywhere]';

interface PlaceConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    /** The red body under the title. */
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
    isPending?: boolean;
    /**
     * Whether the confirm press closes the dialog by itself. Pass false when the caller shows the
     * request running (`isPending`) and closes the dialog once it settles.
     */
    closeOnConfirm?: boolean;
    /** Anything shown between the body and the buttons — the delete confirm's room list. */
    children?: ReactNode;
}

/**
 * The confirm used on the place screens: 311 px card, a title over a red body, Cancel and a red
 * action. While `isPending` the action spins and both buttons, back and Escape are held.
 */
export const PlaceConfirmDialog = ({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    onConfirm,
    isPending = false,
    closeOnConfirm = true,
    children,
}: PlaceConfirmDialogProps) => {
    const { t } = useTranslation();

    return (
        <AlertDialog open={open} onOpenChange={next => !isPending && onOpenChange(next)}>
            <AlertDialogContent
                className="gap-0 overflow-hidden rounded-[12px] border-0 p-0 shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)]"
                data-prevent-back-close={isPending ? '' : undefined}
            >
                <div className="flex flex-col items-center gap-[22px] pt-[22px]">
                    <div className="flex w-full flex-col items-center gap-5 px-[22px]">
                        <div className="flex flex-col items-center gap-2 text-center">
                            <AlertDialogTitle
                                className={`text-[18px] font-semibold leading-[1.5] text-foreground ${PLACE_DIALOG_TEXT}`}
                            >
                                {title}
                            </AlertDialogTitle>
                            <AlertDialogDescription
                                className={`text-[16px] font-medium leading-[1.45] tracking-[-0.08px] text-destructive ${PLACE_DIALOG_TEXT}`}
                            >
                                {description}
                            </AlertDialogDescription>
                        </div>
                        {children}
                    </div>

                    <div className="flex w-full">
                        <AlertDialogCancel
                            disabled={isPending}
                            className="mt-0 flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-r border-t border-border bg-transparent text-[16px] font-semibold text-label transition-colors hover:bg-muted disabled:opacity-50"
                        >
                            {t('common.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={event => {
                                // Radix closes after this handler unless the default is prevented.
                                if (!closeOnConfirm) event.preventDefault();
                                onConfirm();
                            }}
                            disabled={isPending}
                            className="flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-t border-border bg-transparent text-[16px] font-semibold text-destructive transition-colors hover:bg-muted disabled:opacity-50"
                        >
                            {isPending ? (
                                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                                confirmLabel
                            )}
                        </AlertDialogAction>
                    </div>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
};
