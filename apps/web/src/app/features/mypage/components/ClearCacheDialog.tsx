import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '../../channels/components/ConfirmDialog';

interface ClearCacheDialogProps {
    isOpen: boolean;
    isPending: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export const ClearCacheDialog = ({ isOpen, isPending, onClose, onConfirm }: ClearCacheDialogProps) => {
    const { t } = useTranslation();

    return (
        <ConfirmDialog
            open={isOpen}
            onOpenChange={open => !open && onClose()}
            title={t('mypage.clearCache.dialogTitle')}
            description={t('mypage.clearCache.dialogDescription')}
            confirmLabel={t('mypage.clearCache.confirm')}
            onConfirm={onConfirm}
            isPending={isPending}
            // The clear ends in a reload, so the dialog has to stay up with its spinner until then
            // rather than closing on the press and leaving a screen that looks idle.
            closeOnConfirm={false}
            variant="warning"
        />
    );
};
