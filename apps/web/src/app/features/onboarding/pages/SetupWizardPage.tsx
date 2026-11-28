import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/runtime-react';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    FloatingButton,
    IconBack,
    IconButton,
    ModalTopBar,
    ProfileAvatar,
    ScreenLayout,
    Text,
    TextField,
} from '@chatic/web-ui-kit';

import { usePickImage, useSetMyPlaceProfile, useUpdateCloudProfile } from '../../../hooks';
import { useSiteSwitch } from '../../../runtime/useSiteSwitch';
import { ROUTES } from '../../../routes/paths';
import { WizardProgress } from '../components';

const NAME_MAX = 20;
const TOTAL_STEPS = 3;

interface Draft {
    cloudName: string;
    placeName: string;
    placeThumbnail: string;
    profileNick: string;
    profileThumbnail: string;
}

const EMPTY: Draft = {
    cloudName: '',
    placeName: '',
    placeThumbnail: '',
    profileNick: '',
    profileThumbnail: '',
};

export const SetupWizardPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();

    const [step, setStep] = useState(1);
    const [draft, setDraft] = useState<Draft>(EMPTY);
    const [busy, setBusy] = useState(false);
    const [unswitchedPlaceId, setUnswitchedPlaceId] = useState<string | null>(null);

    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { mutateAsync: updateCloudName } = useUpdateCloudProfile();
    const { createPlace } = runtime.data.useCreatePlace();
    const { switchSite } = useSiteSwitch();
    const setMyPlaceProfile = useSetMyPlaceProfile();

    const imageError = () => toast({ title: t('setupWizard.imageSizeError'), variant: 'destructive' });
    const placePhoto = usePickImage({
        onPicked: base64 => setDraft(d => ({ ...d, placeThumbnail: base64 })),
        onError: imageError,
    });
    const profilePhoto = usePickImage({
        onPicked: base64 => setDraft(d => ({ ...d, profileThumbnail: base64 })),
        onError: imageError,
    });

    const nameForStep = step === 1 ? draft.cloudName : step === 2 ? draft.placeName : draft.profileNick;
    const canAdvance = nameForStep.trim().length > 0 && nameForStep.length <= NAME_MAX && !busy;

    const setName = (value: string) =>
        setDraft(d => ({
            ...d,
            ...(step === 1 ? { cloudName: value } : step === 2 ? { placeName: value } : { profileNick: value }),
        }));

    const commit = async () => {
        if (step === 1) {
            if (!selectedCloudId) throw new Error('no cloud selected');
            await updateCloudName({ id: selectedCloudId, name: draft.cloudName.trim() });
            return;
        }
        if (step === 2) {
            let placeId = unswitchedPlaceId;
            if (!placeId) {
                const created = await createPlace({
                    name: draft.placeName.trim(),
                    thumbnail: draft.placeThumbnail || undefined,
                });
                placeId = created.id;
                setUnswitchedPlaceId(placeId);
            }
            await switchSite(placeId);
            setUnswitchedPlaceId(null);
            return;
        }
        await setMyPlaceProfile({ nick: draft.profileNick.trim(), thumbnail: draft.profileThumbnail || undefined });
    };

    const handleNext = async () => {
        if (!canAdvance) return;
        setBusy(true);
        try {
            await commit();
            if (step < TOTAL_STEPS) setStep(step + 1);
            else navigate(ROUTES.home, { replace: true });
        } catch (e) {
            logger.error('SETUP', '[SetupWizardPage] step failed', { step, error: e });
            toast({ title: t('setupWizard.saveError'), variant: 'destructive' });
        } finally {
            setBusy(false);
        }
    };

    const stepKey = step === 1 ? 'cloud' : step === 2 ? 'place' : 'profile';
    const photo = step === 2 ? placePhoto : profilePhoto;
    const thumbnail = step === 2 ? draft.placeThumbnail : draft.profileThumbnail;

    return (
        <ScreenLayout
            className="h-screen"
            header={
                <ModalTopBar
                    safeArea
                    title={`${step}/${TOTAL_STEPS}`}
                    leftSlot={
                        step > 1 ? (
                            <IconButton
                                icon={<IconBack className="size-[26px]" />}
                                label={t('common.back')}
                                onClick={() => !busy && setStep(step - 1)}
                            />
                        ) : undefined
                    }
                    onClose={step > 1 ? () => navigate(ROUTES.home, { replace: true }) : undefined}
                />
            }
            footer={
                <FloatingButton
                    label={t(step < TOTAL_STEPS ? 'setupWizard.next' : 'setupWizard.done')}
                    onClick={() => void handleNext()}
                    disabled={!canAdvance}
                    loading={busy}
                />
            }
        >
            <div className="flex flex-col gap-8 pt-6">
                <WizardProgress step={step} total={TOTAL_STEPS} />

                <div className="flex flex-col items-center gap-2 px-4 text-center">
                    <h1 className="whitespace-pre-line text-[20px] font-bold leading-[1.35] tracking-[-0.02em] text-foreground">
                        {t(`setupWizard.${stepKey}.title`, { place: draft.placeName })}
                    </h1>
                    <p className="whitespace-pre-line text-[14px] leading-[1.5] text-[#78828A]">
                        {t(`setupWizard.${stepKey}.subtitle`)}
                    </p>
                </div>

                {step > 1 && (
                    <div className="flex flex-col items-center gap-4">
                        <ProfileAvatar
                            src={thumbnail || undefined}
                            onSelect={photo.open}
                            selectLabel={t(`setupWizard.${stepKey}.photoLabel`)}
                        />
                        <div className="flex flex-col items-center gap-0.5">
                            <Text variant="label" className="text-label">
                                {t(`setupWizard.${stepKey}.photoLabel`)}
                            </Text>
                            <Text variant="caption" className="text-placeholder">
                                {t('setupWizard.photoOptional')}
                            </Text>
                        </div>
                        <input {...photo.inputProps} />
                    </div>
                )}

                <TextField
                    label={t(`setupWizard.${stepKey}.nameLabel`)}
                    required
                    value={nameForStep}
                    onChange={setName}
                    placeholder={t('setupWizard.namePlaceholder')}
                    maxLength={NAME_MAX}
                    enforceMaxLength={false}
                    error={nameForStep.length > NAME_MAX ? t('setupWizard.nameTooLong', { max: NAME_MAX }) : undefined}
                    description={t('setupWizard.nameHint', { max: NAME_MAX })}
                />
            </div>
        </ScreenLayout>
    );
};
