import { useTranslation } from 'react-i18next';

import { buttonVariants } from '@chatic/ui-kit/components/ui/button';
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

interface WithdrawalDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export const WithdrawalDialog = ({ isOpen, onClose, onConfirm }: WithdrawalDialogProps) => {
    const { t } = useTranslation();

    return (
        <AlertDialog open={isOpen} onOpenChange={onClose}>
            <AlertDialogContent className="max-w-[288px] rounded-2xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-center">{t('mypage.withdrawalDialog.title')}</AlertDialogTitle>
                    <AlertDialogDescription className="text-center">
                        {t('mypage.withdrawalDialog.description')}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row gap-2">
                    <AlertDialogCancel className="mt-0 flex-1">{t('mypage.withdrawalDialog.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className={buttonVariants({ variant: 'destructive', className: 'flex-1' })}
                    >
                        {t('mypage.withdrawalDialog.confirm')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
