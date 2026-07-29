import { useTranslation } from 'react-i18next';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useMyProfile } from '../../../hooks';

import { PlaceProfileFormDialog } from './PlaceProfileFormDialog';

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
    const { profile: profileRepository } = useRuntimeRepositories();
    const { profile: myProfile } = useMyProfile();

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
            // Block body, not a concise arrow: setMyProfile resolves to the saved profile, and
            // onSubmit is typed Promise<void>. Awaiting here discards the value instead of widening
            // the form's contract.
            onSubmit={async ({ nick, thumbnail }) => {
                await profileRepository.setMyProfile({ nick, thumbnail });
            }}
            onDone={onClose}
            onExit={onClose}
        />
    );
};
