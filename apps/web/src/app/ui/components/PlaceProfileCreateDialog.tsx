import { useTranslation } from 'react-i18next';

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
    /**
     * When false, the X button and esc/overlay dismissal are removed — the required step of the cloud
     * invite pipeline and of place creation. Defaults to true; the room-settings nudge and the relay
     * invite entry points stay skippable by omitting it.
     */
    dismissible?: boolean;
    /** Persists the profile. Supplied by the caller (see `useSetMyPlaceProfile`). */
    onSubmit: (value: { nick: string; thumbnail?: string }) => Promise<void>;
}

/**
 * Full-screen overlay to CREATE the per-place profile (nick + optional photo) for the active place.
 * Thin wrapper over {@link PlaceProfileFormDialog} — supplies create-specific copy and a blank
 * starting state; the edit counterpart is {@link PlaceProfileEditDialog}. Persists via
 * ProfileRepository.setMyProfile.
 *
 * Opened where a missing profile actually blocks something useful: the room-settings nudge on my own
 * member row, the relay invite paths (before the accept), and — right after the session switches
 * into the place — the cloud invite pipeline and the place-create overlay. Those two pass
 * `dismissible={false}` until a save has failed, so the step is required without being a trap.
 */
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
