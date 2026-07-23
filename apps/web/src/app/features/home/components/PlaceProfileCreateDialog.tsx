import { useTranslation } from 'react-i18next';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { PlaceProfileFormDialog } from './PlaceProfileFormDialog';

interface PlaceProfileCreateDialogProps {
    /** Controls visibility (owned by the caller). */
    open: boolean;
    /** Active place name, interpolated into the title. */
    placeName: string;
    /** Called after the profile is created successfully. */
    onDone: () => void;
    /** Called when the user chooses to leave without creating a profile. */
    onExit: () => void;
    /**
     * Whether the user may dismiss without creating a profile. Defaults to true. Pass false for the
     * mandatory first-time setup on the relay/default place, which hides the close button.
     */
    dismissible?: boolean;
}

/**
 * Full-screen overlay to CREATE the per-place profile (nick + optional photo) for the active place.
 * Shown by the home prompt when the place has no profile yet. Thin wrapper over
 * {@link PlaceProfileFormDialog} — supplies create-specific copy and a blank starting state; the
 * edit counterpart is {@link PlaceProfileEditDialog}. Persists via ProfileRepositoryV2.setMyProfile.
 */
export const PlaceProfileCreateDialog = ({
    open,
    placeName,
    onDone,
    onExit,
    dismissible = true,
}: PlaceProfileCreateDialogProps) => {
    const { t } = useTranslation();
    const { profile: profileRepository } = useRuntimeRepositories();

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
            dismissible={dismissible}
            exit={{
                title: t('placeProfileCreate.exitTitle'),
                description: t('placeProfileCreate.exitDescription'),
                leaveLabel: t('placeProfileCreate.exitLeave'),
                continueLabel: t('placeProfileCreate.exitContinue'),
            }}
            onSubmit={({ nick, thumbnail }) => profileRepository.setMyProfile({ nick, thumbnail })}
            onDone={onDone}
            onExit={onExit}
        />
    );
};
