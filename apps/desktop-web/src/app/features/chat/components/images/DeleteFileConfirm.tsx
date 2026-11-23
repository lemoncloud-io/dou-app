import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '../../../channels';

export const DeleteFileConfirm = ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) => {
    const { t } = useTranslation();
    return (
        <ConfirmDialog
            open
            onOpenChange={open => !open && onCancel()}
            title={t('chat.deleteConfirm.title')}
            description={t('chat.deleteConfirm.noPreview')}
            confirmLabel={t('chat.image.delete')}
            variant="danger"
            onConfirm={onConfirm}
        />
    );
};
