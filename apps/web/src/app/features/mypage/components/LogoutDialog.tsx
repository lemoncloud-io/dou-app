import { useTranslation } from 'react-i18next';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

interface LogoutDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export const LogoutDialog = ({ isOpen, onClose, onConfirm }: LogoutDialogProps) => {
    const { t } = useTranslation();

    return (
        <AlertDialog open={isOpen} onOpenChange={onClose}>
            <AlertDialogContent className="max-w-[288px] rounded-2xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-center">{t('mypage.logoutDialog.title')}</AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row gap-2">
                    <AlertDialogCancel className="mt-0 flex-1">{t('mypage.logoutDialog.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} className="flex-1">
                        {t('mypage.logoutDialog.confirm')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
