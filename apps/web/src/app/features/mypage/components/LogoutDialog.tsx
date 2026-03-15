import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '../../chats/components/ConfirmDialog';

interface LogoutDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export const LogoutDialog = ({ isOpen, onClose, onConfirm }: LogoutDialogProps) => {
    const { t } = useTranslation();

    return (
        <ConfirmDialog
            open={isOpen}
            onOpenChange={open => !open && onClose()}
            title={t('mypage.logoutDialog.title')}
            confirmLabel={t('mypage.logoutDialog.confirm')}
            onConfirm={onConfirm}
            variant="warning"
        />
    );
};
