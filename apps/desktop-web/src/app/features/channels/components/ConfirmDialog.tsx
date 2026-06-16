import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
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
}

/**
 * Generic confirmation dialog (delete / leave / kick). Desktop-native rebuild of
 * the apps/web ConfirmDialog pattern (ADR-0002 — no cross-app imports).
 */
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

    const handleOpenChange = (next: boolean) => {
        if (!isPending) onOpenChange(next);
    };

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent className="sm:max-w-sm">
                <AlertDialogTitle>{title}</AlertDialogTitle>
                <AlertDialogDescription className={cn(description ? '' : 'sr-only')}>
                    {description ?? title}
                </AlertDialogDescription>
                <div className="flex justify-end gap-2 pt-2">
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
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
};
