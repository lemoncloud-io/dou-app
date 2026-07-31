import { useTranslation } from 'react-i18next';

import { PlaceProfileFormDialog } from '../../../home/components/PlaceProfileFormDialog';
import { useSaveMyPlaceProfile } from '../../../home/hooks';

interface RelayInviteProfileDialogProps {
    /** The profile was saved — the accept flow moves on. */
    onDone: () => void;
    /** The user backed out — the accept flow returns to its review screen. */
    onExit: () => void;
}

/**
 * Profile step of the relay invite accept flow: the invitee has no nick in the relay place, so ask
 * for one before accepting (ADR-0033 D10). A thin wrapper over the shared place-profile form
 * (ADR-0020) — same fields, same 20-character limit, same save path — with setup copy and, unlike
 * the edit wrapper, distinct done/exit handlers so backing out returns to the invite rather than
 * dropping the user on home.
 *
 * Copy comes from `placeProfileCreate.*` except the heading: that namespace interpolates a place
 * name, and the relay place has none worth showing (it is the user's implicit personal place), so the
 * invite supplies its own title and subtitle.
 */
export const RelayInviteProfileDialog = ({ onDone, onExit }: RelayInviteProfileDialogProps) => {
    const { t } = useTranslation();
    const saveProfile = useSaveMyPlaceProfile();

    return (
        <PlaceProfileFormDialog
            open
            title={t('relayInviteAccept.profile.title')}
            subtitle={t('relayInviteAccept.profile.subtitle')}
            initialNick=""
            initialThumbnail=""
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
            exit={{
                title: t('placeProfileCreate.exitTitle'),
                description: t('placeProfileCreate.exitDescription'),
                leaveLabel: t('placeProfileCreate.exitLeave'),
                continueLabel: t('placeProfileCreate.exitContinue'),
            }}
            onSubmit={saveProfile}
            onDone={onDone}
            onExit={onExit}
        />
    );
};
