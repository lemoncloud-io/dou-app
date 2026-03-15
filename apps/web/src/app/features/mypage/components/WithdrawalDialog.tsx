import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '../../chats/components/ConfirmDialog';

interface WithdrawalDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export const WithdrawalDialog = ({ isOpen, onClose, onConfirm }: WithdrawalDialogProps) => {
    const { t } = useTranslation();

    return (
        <ConfirmDialog
            open={isOpen}
            onOpenChange={open => !open && onClose()}
            title={t('mypage.withdrawalDialog.title')}
            description={t('mypage.withdrawalDialog.description')}
            confirmLabel={t('mypage.withdrawalDialog.confirm')}
            onConfirm={onConfirm}
            variant="danger"
        />
    );
};
