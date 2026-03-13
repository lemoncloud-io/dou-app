import { useTranslation } from 'react-i18next';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';
import { cn } from '@chatic/lib/utils';

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
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

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="mx-4 max-w-[calc(100%-32px)] rounded-2xl p-6 sm:max-w-[320px]">
                <AlertDialogHeader className="space-y-3">
                    <AlertDialogTitle className="text-center text-[17px] font-semibold leading-[22px] text-[#222325]">
                        {title}
                    </AlertDialogTitle>
                    <AlertDialogDescription
                        className={cn(
                            'text-center text-[14px] leading-[1.4]',
                            variant === 'danger' ? 'text-[#FF4D4F]' : 'text-[#84888F]'
                        )}
                    >
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-4 flex-row gap-2 sm:flex-row sm:justify-center sm:space-x-0">
                    <AlertDialogCancel
                        disabled={isPending}
                        className="m-0 flex-1 rounded-lg border-0 bg-[#F4F5F5] text-[15px] font-medium text-[#3A3C40] hover:bg-[#E8E9EA]"
                    >
                        {t('common.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        disabled={isPending}
                        className={cn(
                            'm-0 flex-1 rounded-lg border-0 text-[15px] font-medium',
                            variant === 'danger'
                                ? 'bg-white text-[#FF4D4F] hover:bg-[#FFF1F0]'
                                : 'bg-white text-[#2A7EF4] hover:bg-[#F0F7FF]'
                        )}
                    >
                        {isPending ? (
                            <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                            confirmLabel
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
