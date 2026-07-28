import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { useRuntimeRepositories } from '@chatic/app-runtime';

import { PlaceProfileForm } from '../../home/components';
import { useMyProfile } from '../../../hooks';
import { PageHeader } from '../../../ui';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

/**
 * Route-page variant of the per-place profile editor (nick + optional photo). Same shared
 * {@link PlaceProfileForm} and `setMyProfile` save path as the home dropdown's dialog, rendered as a
 * full page here (settings hub entry). Both the read (`useMyProfile`) and the write (`setMyProfile`)
 * target the session-active place; the hub is only reached for the active place so `placeId` matches.
 */
export const PlaceProfilePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepo, profile: profileRepository } = useRuntimeRepositories();
    const { profile: myProfile } = useMyProfile();

    const [place, setPlace] = useState<MySiteView | null>(null);

    useEffect(() => {
        if (!placeId) {
            setPlace(null);
            return;
        }
        return placeRepo.observeItem(placeId, setPlace);
    }, [placeRepo, placeId]);

    const close = () => navigate(-1);
    const title = t('placeProfileEdit.title', { place: place?.name ?? '' });

    // The shared form seeds its fields once on mount. `useMyProfile` starts null and resolves a render
    // later, so mount the form only after the profile is available — otherwise it would latch empty
    // values and a save could wipe the existing photo. Until then show just the header (back works).
    if (!myProfile) {
        return (
            <div className="flex h-full flex-col bg-background pt-safe-top">
                <PageHeader title="" onBack={close} />
            </div>
        );
    }

    return (
        <PlaceProfileForm
            container="page"
            open
            title={title}
            initialNick={myProfile.nick ?? ''}
            initialThumbnail={myProfile.thumbnail ?? ''}
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
