import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useDeviceInfo } from '../../../hooks/useDeviceInfo';
import { prepareImage, REPORT_PHOTO, useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/runtime';
import { FloatingButton, IconBack, ModalTopBar, PhotoAttachField, TextField, Textarea } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { KeyboardAwareLayout, fixedViewportScreen } from '../../../ui/layouts/KeyboardAwareLayout';
import { buildReportContext } from '../lib';

const MAX_INPUT_LENGTH = 5000;

const MAX_PHOTOS = 5;

export const FeedbackPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const { deviceInfo, versionInfo } = useDeviceInfo();

    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isValid = title.trim().length > 0 && body.trim().length > 0;

    const handleSelectPhotos = async (files: File[]) => {
        const room = MAX_PHOTOS - photos.length;
        if (files.length > room) toast({ title: t('feedback.photoLimit', { max: MAX_PHOTOS }) });
        const accepted = files.slice(0, room);
        if (!accepted.length) return;

        try {
            const encoded = await Promise.all(
                accepted.map(async file => {
                    const { photo } = await prepareImage(file, REPORT_PHOTO);
                    if (!photo) throw new Error('Failed to prepare report photo');
                    return photo;
                })
            );
            setPhotos(prev => [...prev, ...encoded].slice(0, MAX_PHOTOS));
        } catch (error) {
            logger.error('FEEDBACK', 'Failed to encode attached photo', { error });
            toast({ title: t('feedback.photoFailed'), variant: 'destructive' });
        }
    };

    const handleSubmit = async () => {
        if (!isValid || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const extras = buildReportContext({ deviceInfo, versionInfo });
            await runtime.report.reportIssue(title.trim(), body.trim(), {
                ...extras,
                ...(photos.length ? { images: photos } : {}),
            });
            toast({ title: t('feedback.success') });
            navigate(-1);
        } catch (error) {
            logger.error('FEEDBACK', 'Failed to submit feedback', { error });
            toast({ title: t('feedback.failed'), variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <KeyboardAwareLayout
            className={fixedViewportScreen}
            headerSafeArea={false}
            header={
                <ModalTopBar
                    title={t('feedback.title')}
                    leftSlot={
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            aria-label={t('common.back')}
                            className="flex h-11 w-11 items-center justify-center"
                        >
                            <IconBack className="size-[26px] text-foreground" />
                        </button>
                    }
                />
            }
            footer={
                <FloatingButton
                    label={t('feedback.submit')}
                    disabled={!isValid || isSubmitting}
                    loading={isSubmitting}
                    onClick={handleSubmit}
                />
            }
        >
            <div className="flex flex-col gap-10 pt-4">
                <div className="flex flex-col gap-4 px-4">
                    <p className="whitespace-pre-line text-center text-[20px] font-semibold leading-[1.35] tracking-[-0.1px] text-foreground">
                        {t('feedback.heading')}
                    </p>
                    <ul className="list-inside list-disc text-center text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-description">
                        <li>{t('feedback.noticePurpose')}</li>
                        <li>{t('feedback.noticeNoReply')}</li>
                    </ul>
                </div>

                <div className="flex flex-col gap-8 pb-[30px]">
                    <TextField
                        label={t('feedback.titleLabel')}
                        value={title}
                        onChange={value => setTitle(value.slice(0, MAX_INPUT_LENGTH))}
                        placeholder={t('feedback.titlePlaceholder')}
                        disabled={isSubmitting}
                    />

                    <Textarea
                        label={t('feedback.bodyLabel')}
                        value={body}
                        onChange={value => setBody(value.slice(0, MAX_INPUT_LENGTH))}
                        placeholder={t('feedback.bodyPlaceholder')}
                        disabled={isSubmitting}
                    />

                    <PhotoAttachField
                        label={t('feedback.photoLabel')}
                        value={photos}
                        onSelect={handleSelectPhotos}
                        onRemove={index => setPhotos(prev => prev.filter((_, i) => i !== index))}
                        hint={t('feedback.photoHint')}
                        description={t('feedback.photoDescription', { max: MAX_PHOTOS })}
                        max={MAX_PHOTOS}
                        removeLabel={index => t('feedback.photoRemove', { index })}
                        disabled={isSubmitting}
                    />
                </div>
            </div>
        </KeyboardAwareLayout>
    );
};
