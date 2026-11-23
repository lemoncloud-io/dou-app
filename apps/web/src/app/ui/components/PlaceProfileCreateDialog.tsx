import { useTranslation } from 'react-i18next';

import type { PlaceProfileExitCopy } from './PlaceProfileForm';
import { PlaceProfileFormDialog } from './PlaceProfileFormDialog';

interface PlaceProfileCreateDialogProps {
    open: boolean;
    placeName: string;
    onDone: () => void;
    onExit: () => void;
    exit?: PlaceProfileExitCopy;
    dismissible?: boolean;
    onSubmit: (value: { nick: string; thumbnail?: string }) => Promise<void>;
}

export const PlaceProfileCreateDialog = ({
    open,
    placeName,
    onDone,
    onExit,
    exit,
    dismissible,
    onSubmit,
}: PlaceProfileCreateDialogProps) => {
    const { t } = useTranslation();

    return (
        <PlaceProfileFormDialog
            open={open}
            title={t('placeProfileCreate.title', { place: placeName })}
            subtitle={t('placeProfileCreate.subtitle')}
            submitLabel={t('placeProfileCreate.done')}
            successToast={t('placeProfileCreate.successToast')}
            saveError={t('placeProfileCreate.saveError')}
            imageSizeError={t('placeProfileCreate.imageSizeError')}
            nameLabel={t('placeProfileCreate.nameLabel')}
            nameHint={t('placeProfileCreate.nameHint')}
            namePlaceholder={t('placeProfileCreate.namePlaceholder')}
            photoLabel={t('placeProfileCreate.photoLabel')}
            photoOptional={t('placeProfileCreate.photoOptional')}
            closeLabel={t('placeProfileCreate.close')}
            exit={exit}
            dismissible={dismissible}
            onSubmit={onSubmit}
            onDone={onDone}
            onExit={onExit}
        />
    );
};
