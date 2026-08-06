import { useTranslation } from 'react-i18next';

import { useMyProfile, useSetMyPlaceProfile } from '../../../hooks';

import { PlaceProfileFormDialog } from '../../../ui/components/PlaceProfileFormDialog';

interface PlaceProfileEditDialogProps {
    /** Controls visibility (owned by the caller). */
    open: boolean;
    /** Active place name, interpolated into the title. */
    placeName: string;
    /** Called when the dialog should close (after save or on exit). */
    onClose: () => void;
}

/**
 * Full-screen overlay to EDIT the per-place profile (nick + optional photo) for the active place.
 * Opened from the home header dropdown. Thin wrapper over {@link PlaceProfileFormDialog} — seeds the
 * current profile from {@link useMyProfile} and supplies edit-specific copy. Persists via
 * ProfileRepositoryV2.setMyProfile.
 */
export const PlaceProfileEditDialog = ({ open, placeName, onClose }: PlaceProfileEditDialogProps) => {
    const { t } = useTranslation();
    const { profile: myProfile } = useMyProfile();
    const setMyPlaceProfile = useSetMyPlaceProfile();

    return (
        <PlaceProfileFormDialog
            open={open}
            title={t('placeProfileEdit.title', { place: placeName })}
            initialNick={myProfile?.nick ?? ''}
            initialThumbnail={myProfile?.thumbnail ?? ''}
            submitLabel={t('placeProfileEdit.done')}
            successToast={t('placeProfileEdit.successToast')}
            saveError={t('placeProfileEdit.saveError')}
            imageSizeError={t('placeProfileEdit.imageSizeError')}
            nameLabel={t('placeProfileEdit.nameLabel')}
            nameHint={t('placeProfileEdit.nameHint')}
            namePlaceholder={t('placeProfileEdit.namePlaceholder')}
            photoLabel={t('placeProfileEdit.photoLabel')}
            photoOptional={t('placeProfileEdit.photoOptional')}
            closeLabel={t('placeProfileEdit.close')}
            exit={{
                title: t('placeProfileEdit.exitTitle'),
                description: t('placeProfileEdit.exitDescription'),
                leaveLabel: t('placeProfileEdit.exitLeave'),
                continueLabel: t('placeProfileEdit.exitContinue'),
            }}
            onSubmit={setMyPlaceProfile}
            onDone={onClose}
            onExit={onClose}
        />
    );
};
