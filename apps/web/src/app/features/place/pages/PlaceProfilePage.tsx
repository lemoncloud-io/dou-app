import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { PlaceProfileForm } from '../../../ui/components/PlaceProfileForm';
import { useMyProfile, usePlaceProfileAbsent, useSetMyPlaceProfile } from '../../../hooks';
import { PageHeader } from '../../../ui';

export const PlaceProfilePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const setMyPlaceProfile = useSetMyPlaceProfile();
    const { profile: myProfile } = useMyProfile();
    const { absent } = usePlaceProfileAbsent();

    const close = () => navigate(-1);
    const title = t('placeProfileEdit.header');

    if (absent === undefined || (absent === false && !myProfile)) {
        return (
            <div className="flex h-full flex-col bg-background">
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
            onSubmit={setMyPlaceProfile}
            onDone={close}
            onExit={close}
        />
    );
};
