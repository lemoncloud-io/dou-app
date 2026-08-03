import { useTranslation } from 'react-i18next';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import type { PlaceProfileExitCopy } from './PlaceProfileForm';
import { PlaceProfileFormDialog } from './PlaceProfileFormDialog';

interface PlaceProfileCreateDialogProps {
    /** Controls visibility (owned by the caller). */
    open: boolean;
    /** Place display name interpolated into the title. Callers pass the RESOLVED name. */
    placeName: string;
    /** Called after the profile is created successfully. */
    onDone: () => void;
    /** Called when the user leaves without creating a profile. */
    onExit: () => void;
    /**
     * Unsaved-changes guard copy. OMIT to exit immediately on X — the invite paths (ADR-0041) do,
     * so a user who backs out there is simply not inviting/accepting.
     */
    exit?: PlaceProfileExitCopy;
}

/**
 * Full-screen overlay to CREATE the per-place profile (nick + optional photo) for the active place.
 * Thin wrapper over {@link PlaceProfileFormDialog} — supplies create-specific copy and a blank
 * starting state; the edit counterpart is {@link PlaceProfileEditDialog}. Persists via
 * ProfileRepositoryV2.setMyProfile.
 *
 * Opened where a missing profile actually blocks something useful: the room-settings nudge on my own
 * member row (ADR-0040) and the invite paths (ADR-0041). It is never mandatory — the app works
 * without a place profile (ADR-0039 dropped the last forced step).
 */
export const PlaceProfileCreateDialog = ({ open, placeName, onDone, onExit, exit }: PlaceProfileCreateDialogProps) => {
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
            exit={exit}
            // Block body, not a concise arrow: setMyProfile resolves to the saved profile, and
            // onSubmit is typed Promise<void>. Awaiting here discards the value instead of widening
            // the form's contract.
            onSubmit={async ({ nick, thumbnail }) => {
                await profileRepository.setMyProfile({ nick, thumbnail });
            }}
            onDone={onDone}
            onExit={onExit}
        />
    );
};
