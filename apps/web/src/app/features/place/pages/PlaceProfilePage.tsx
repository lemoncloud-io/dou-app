import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useRuntimeRepositories } from '@chatic/app-runtime';

import { PlaceProfileForm } from '../../../ui/components/PlaceProfileForm';
import { useMyProfile, usePlaceProfileAbsent } from '../../../hooks';
import { PageHeader } from '../../../ui';

/**
 * Route-page variant of the per-place profile editor (nick + optional photo). Same shared
 * {@link PlaceProfileForm} and `setMyProfile` save path as the home dropdown's dialog, rendered as a
 * full page here (settings hub entry). Both the read (`useMyProfile`) and the write (`setMyProfile`)
 * target the session-active place; the hub is only reached for the active place. The screen title
 * ("내 프로필") lives in the page header (PlaceProfileForm's page container renders it there). It uses
 * the page-only `placeProfileEdit.header` key so the edit dialog's place-interpolated `title` heading
 * (shared copy) stays untouched.
 */
export const PlaceProfilePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { profile: profileRepository } = useRuntimeRepositories();
    const { profile: myProfile } = useMyProfile();
    // Only a settled signal, not the verdict: `useMyProfile` cannot say whether its null means
    // "loading" or "no profile", and this page must render an empty form in the second case.
    const { absent } = usePlaceProfileAbsent();

    const close = () => navigate(-1);
    const title = t('placeProfileEdit.header');

    // The shared form seeds its fields exactly once (`seededRef`), so what we wait for decides what the
    // user sees. Two conditions, not one:
    //   - `absent === undefined`: the read has not settled at all.
    //   - `absent === false && !myProfile`: a profile exists but its row has not arrived. `absent`
    //     resolves off `getMyProfile()` while `myProfile` comes through `observeItem`, whose re-emit
    //     after the cache write is debounced ~50ms — so on a cold row `absent` lands FIRST. Mounting
    //     there would latch a blank name over a real profile and let the user replace their nick
    //     without ever seeing it.
    // `absent === true` deliberately falls through with no row: that is the create case ADR-0041
    // decision 7 opened, where an empty form is the correct thing to show.
    if (absent === undefined || (absent === false && !myProfile)) {
        return (
            <div className="flex h-full flex-col bg-background pt-safe-top">
                <PageHeader title={title} onBack={close} />
            </div>
        );
    }

    return (
        <PlaceProfileForm
            container="page"
            open
            title={title}
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
            onSubmit={async ({ nick, thumbnail }) => {
                await profileRepository.setMyProfile({ nick, thumbnail });
            }}
            onDone={close}
            onExit={close}
        />
    );
};
