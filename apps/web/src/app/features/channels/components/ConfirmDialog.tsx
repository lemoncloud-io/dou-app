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
                className="max-w-[288px] gap-0 overflow-hidden rounded-[12px] border-0 p-0 shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)]"
                data-prevent-back-close={isPending ? '' : undefined}
            >
                <div className="flex flex-col items-center gap-[22px] pt-[22px]">
                    <div className="flex flex-col items-center gap-2 px-[22px] text-center">
                        <AlertDialogTitle className="text-[18px] font-semibold leading-[1.5] text-foreground">
                            {title}
                        </AlertDialogTitle>
                        <AlertDialogDescription
                            className={cn(
                                'text-[16px] font-medium leading-[1.45] tracking-[-0.16px]',
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
                            onClick={onConfirm}
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
