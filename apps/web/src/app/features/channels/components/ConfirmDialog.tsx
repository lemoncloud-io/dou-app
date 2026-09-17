import { useTranslation } from 'react-i18next';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
} from '@chatic/ui-kit/components/ui/alert-dialog';
import { cn } from '@chatic/ui-kit';

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    confirmLabel: string;
    onConfirm: () => void;
    isPending?: boolean;
    variant?: 'danger' | 'warning';
    /**
     * Whether the confirm press closes the dialog by itself. Default true, which is what a
     * confirm that starts no round trip wants.
     *
     * Pass false when the caller drives `isPending`. `AlertDialogAction` is Radix's
     * `DialogPrimitive.Close`, so the press closes the dialog before the work it started can
     * report as in flight — `isPending` then flips true against an unmounted dialog and the
     * spinner, the disabled buttons and the back-close guard below are all unreachable. A caller
     * that passes false closes the dialog itself once the work settles.
     */
    closeOnConfirm?: boolean;
}

export const ConfirmDialog = ({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    onConfirm,
    isPending = false,
    variant = 'danger',
    closeOnConfirm = true,
}: ConfirmDialogProps) => {
    const { t } = useTranslation();

    const handleOpenChange = (isOpen: boolean) => {
        if (!isPending) {
            onOpenChange(isOpen);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent
                className="gap-0 overflow-hidden rounded-[12px] border-0 p-0 shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)]"
                data-prevent-back-close={isPending ? '' : undefined}
            >
                <div className="flex flex-col items-center gap-[22px] pt-[22px]">
                    <div className="flex flex-col items-center gap-2 px-[22px] text-center">
                        <AlertDialogTitle className="text-[18px] font-semibold leading-[1.5] text-foreground">
                            {title}
                        </AlertDialogTitle>
                        {/* `overflow-wrap: anywhere`, not `break-words`. Since this dialog started
                            quoting message text back to the user, the description can be a run with
                            no space in it — a URL, an id, a line of code. An unbroken run's
                            min-content width is the WHOLE run, and min-content beats the box's
                            the variant's own width, so the panel and the button row below it stretch to fit
                            it: measured 644px of text pushing the confirm button to x 388-732 on a
                            375px screen, entirely off-screen and unreachable. `break-words` does not
                            fix that (it wraps but leaves min-content intact); `anywhere` reduces
                            min-content, which is what has to shrink. */}
                        <AlertDialogDescription
                            className={cn(
                                'text-[16px] font-medium leading-[1.45] tracking-[-0.16px]',
                                'min-w-0 [overflow-wrap:anywhere]',
                                description ? '' : 'sr-only',
                                variant === 'danger' ? 'text-destructive' : 'text-dialog-subtitle'
                            )}
                        >
                            {description || title}
                        </AlertDialogDescription>
                    </div>

                    <div className="flex w-full">
                        <AlertDialogCancel
                            disabled={isPending}
                            className="mt-0 flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-r border-t border-border bg-transparent text-[16px] font-medium text-dialog-subtitle transition-colors hover:bg-muted disabled:opacity-50"
                        >
                            {t('common.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={event => {
                                // Radix composes its own close handler after this one and skips it
                                // when the default is prevented, so this is what keeps the dialog
                                // mounted for a caller that reports progress.
                                if (!closeOnConfirm) event.preventDefault();
                                onConfirm();
                            }}
                            disabled={isPending}
                            className={cn(
                                'flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-t border-border bg-transparent text-[16px] font-semibold transition-colors hover:bg-muted disabled:opacity-50',
                                variant === 'danger' ? 'text-destructive' : 'text-foreground'
                            )}
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
