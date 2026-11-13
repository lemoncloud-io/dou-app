import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '../../../channels';

/**
 * "Delete file" asks first. A sent upload has no delete of its own on the server, so what this confirms
 * is deleting the whole message.
 */
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
