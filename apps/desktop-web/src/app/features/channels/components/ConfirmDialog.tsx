import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    AlertDialogFooter,
} from '@chatic/ui-kit/components/ui/alert-dialog';

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    confirmLabel: string;
    onConfirm: () => void;
    isPending?: boolean;
    variant?: 'danger' | 'default';
    fullDescription?: boolean;
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
    fullDescription = false,
}: ConfirmDialogProps) => {
    const { t } = useTranslation();

    const handleOpenChange = (next: boolean) => {
        if (!isPending) onOpenChange(next);
    };

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent className="sm:max-w-sm">
                <AlertDialogTitle>{title}</AlertDialogTitle>
                <AlertDialogDescription className={cn(description ? !fullDescription && 'line-clamp-3' : 'sr-only')}>
                    {description ?? title}
                </AlertDialogDescription>
                <AlertDialogFooter className="gap-2 pt-2 sm:space-x-0">
                    <AlertDialogCancel disabled={isPending}>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        disabled={isPending}
                        className={cn(
                            variant === 'danger' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                        )}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
