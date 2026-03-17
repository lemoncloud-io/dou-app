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
                className="max-w-[288px] gap-0 overflow-hidden rounded-xl border-0 p-0"
                data-prevent-back-close={isPending ? '' : undefined}
            >
                <div className="flex flex-col items-center gap-[26px] pt-7">
                    <div className="flex flex-col items-center gap-2 px-[18px] text-center">
                        <AlertDialogTitle className="text-base font-semibold leading-[1.5] text-foreground">
                            {title}
                        </AlertDialogTitle>
                        <AlertDialogDescription
                            className={cn(
                                'text-sm font-medium leading-[1.5]',
                                description ? '' : 'sr-only',
                                variant === 'danger' ? 'text-destructive' : 'text-muted-foreground'
                            )}
                        >
                            {description || title}
                        </AlertDialogDescription>
                    </div>

                    <div className="flex w-full">
                        <AlertDialogCancel
                            disabled={isPending}
                            className="mt-0 flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-r border-t border-border bg-transparent text-[15px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                        >
                            {t('common.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={onConfirm}
                            disabled={isPending}
                            className={cn(
                                'flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-t border-border bg-transparent text-[15px] font-semibold transition-colors hover:bg-muted disabled:opacity-50',
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
