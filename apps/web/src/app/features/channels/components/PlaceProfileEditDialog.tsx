import { useTranslation } from 'react-i18next';

import { Loader2 } from 'lucide-react';

import { ModalTopBar } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { useMyProfile, useSetMyPlaceProfile } from '../../../hooks';

import { PlaceProfileFormDialog } from '../../../ui/components/PlaceProfileFormDialog';

interface PlaceProfileEditDialogProps {
    /** Controls visibility (owned by the caller). */
    open: boolean;
    /** Active place name, interpolated into the in-body heading. */
    placeName: string;
    /** Called when the dialog should close (after save or on exit). */
    onClose: () => void;
    /**
     * The server's verdict that I have no profile in the active place (`usePlaceProfileAbsent`):
     * `true` once `profile.get-mine` answered with none, `undefined` while it is out. Passed in rather
     * than read here because the caller already holds it, and asking again costs a request.
     */
    profileAbsent?: boolean;
}

/**
 * Full-screen overlay to EDIT the per-place profile (nick + optional photo) for the active place.
 * Opened from the member-profile sheet in room settings. The top bar says what the screen is
 * ("내 프로필"); the heading under it names the place the profile applies to, because a profile
 * belongs to one place and editing it changes nothing in the others. Thin wrapper over
 * {@link PlaceProfileFormDialog} — seeds the current profile from {@link useMyProfile} and supplies
 * edit-specific copy. Persists via ProfileRepository.setMyProfile.
 *
 * **The form is not opened until there is something true to seed it with.** It seeds once, when it
 * opens, and deliberately never again (a background update must not wipe what the user is typing).
 * Opened while my profile had not reached this device — a cold cache, a fetch in flight — it latched
 * an empty name and kept it after the profile arrived, which reads as "you have no profile" to a user
 * who has one. So it waits for either my row in the cache or the server's word that there is none,
 * and shows a loading screen in between.
 */
export const PlaceProfileEditDialog = ({ open, placeName, onClose, profileAbsent }: PlaceProfileEditDialogProps) => {
    const { t } = useTranslation();
    const { profile: myProfile } = useMyProfile();
    const setMyPlaceProfile = useSetMyPlaceProfile();

    const title = t('placeProfileEdit.title', { place: placeName });
    const header = t('placeProfileEdit.header');
    const canSeed = !!myProfile || profileAbsent === true;

    if (open && !canSeed) {
        return (
            <Dialog open onOpenChange={next => !next && onClose()}>
                <DialogContent
                    className="flex h-full max-h-[100dvh] w-full flex-col rounded-none bg-background p-0"
                    hideClose
                    variant="slide-up"
                    // Same chrome as the form's dialog container, so the swap to the form does not jump.
                    style={{ paddingTop: 0, paddingBottom: 0 }}
                >
                    <DialogTitle className="sr-only">{title}</DialogTitle>
                    <DialogDescription className="sr-only">{t('placeProfileEdit.loading')}</DialogDescription>
                    <ModalTopBar title={header} onClose={onClose} closeLabel={t('placeProfileEdit.close')} />
                    <div
                        role="status"
                        aria-label={t('placeProfileEdit.loading')}
                        className="flex flex-1 items-center justify-center text-description"
                    >
                        <Loader2 aria-hidden className="size-7 animate-spin" />
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <PlaceProfileFormDialog
            open={open}
            title={title}
            header={header}
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
