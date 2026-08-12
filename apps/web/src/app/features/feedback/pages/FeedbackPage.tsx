import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useDeviceInfo } from '@chatic/device-utils';
import { scaleImageToDataUrl, useNavigateWithTransition } from '@chatic/shared';
import { reportIssue } from '@chatic/web-core';
import { FloatingButton, IconBack, ModalTopBar, PhotoAttachField, TextField, Textarea } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

// Direct path, not the `ui/layouts` barrel: the barrel reaches PrivateLayout → ui/components →
// Sidebar, whose `import.meta` the CommonJS test transform cannot parse
// (architecture/directory-structure.md §6).
import { KeyboardAwareLayout } from '../../../ui/layouts/KeyboardAwareLayout';
import { buildReportContext } from '../lib';

/**
 * Safety net, not a product limit. No counter is shown and the design asks for
 * no cap, but the report ships alongside 50 log entries and a device snapshot —
 * an unbounded paste would fail the whole submission at the server instead of
 * just being long.
 */
const MAX_INPUT_LENGTH = 5000;

/** Attachment budget from the design ("최대 5장"). */
const MAX_PHOTOS = 5;
/**
 * Encoding budget. Images travel inline as base64, which costs ~4 bytes per 3, so
 * these two numbers are what bound the request: 1024px at q0.6 lands around
 * 60–100 KB each, i.e. well under a megabyte for a full set of five.
 */
const PHOTO_MAX_EDGE = 1024;
const PHOTO_QUALITY = 0.6;

/**
 * "의견 보내기" — the single entry point for user feedback, reached from the
 * MyPage menu. Submits through `reportIssue`, which auto-attaches recent logs, a
 * device/version snapshot and the route trail (see `buildReportContext`).
 *
 * Photos are downscaled to base64 JPEG in the browser and ride in the report
 * payload; a report carrying them is sent silently — see `reportIssue` for why.
 */
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
        // Tell the user the pick was trimmed rather than silently dropping the extras.
        if (files.length > room) toast({ title: t('feedback.photoLimit', { max: MAX_PHOTOS }) });
        const accepted = files.slice(0, room);
        if (!accepted.length) return;

        try {
            const encoded = await Promise.all(
                accepted.map(file => scaleImageToDataUrl(file, { maxEdge: PHOTO_MAX_EDGE, quality: PHOTO_QUALITY }))
            );
            setPhotos(prev => [...prev, ...encoded].slice(0, MAX_PHOTOS));
        } catch (error) {
            // A file the browser cannot decode (wrong extension, corrupt) rejects the whole
            // batch; keep what was already attached and let the user retry.
            logger.error('FEEDBACK', 'Failed to encode attached photo', { error });
            toast({ title: t('feedback.photoFailed'), variant: 'destructive' });
        }
    };

    const handleSubmit = async () => {
        if (!isValid || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const extras = await buildReportContext({ deviceInfo, versionInfo });
            await reportIssue(title.trim(), body.trim(), {
                ...extras,
                ...(photos.length ? { images: photos } : {}),
            });
            toast({ title: t('feedback.success') });
            navigate(-1);
        } catch (error) {
            logger.error('FEEDBACK', 'Failed to submit feedback', { error });
            toast({ title: t('feedback.failed'), variant: 'destructive' });
        } finally {
            // Deliberately not reset on success either — the screen is unmounting, and clearing the
            // fields first would flash an empty form during the navigation transition.
            setIsSubmitting(false);
        }
    };

    return (
        <KeyboardAwareLayout
            className="fixed inset-0 overflow-hidden"
            // ModalTopBar frosts its own notch strip, so the scaffold must not pad above it —
            // that would push the glass down and leave the inset bare.
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
            <div className="flex flex-col gap-6 py-4">
                <div className="flex flex-col gap-4 px-4">
                    <p className="whitespace-pre-line text-center text-[20px] font-semibold leading-[1.35] tracking-[-0.1px] text-foreground">
                        {t('feedback.heading')}
                    </p>
                    <ul className="mx-auto w-fit list-disc pl-[21px] text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-description">
                        <li>{t('feedback.noticePurpose')}</li>
                        <li>{t('feedback.noticeNoReply')}</li>
                    </ul>
                </div>

                <div className="flex flex-col gap-6 pb-[30px] pt-2">
                    <TextField
                        label={t('feedback.titleLabel')}
                        required
                        value={title}
                        // Clamp here rather than via TextField's `maxLength`, which would also render
                        // an "N/5000" counter — the design asks for no visible limit.
                        onChange={value => setTitle(value.slice(0, MAX_INPUT_LENGTH))}
                        placeholder={t('feedback.titlePlaceholder')}
                        disabled={isSubmitting}
                        enterKeyHint="next"
                    />

                    <Textarea
                        label={t('feedback.bodyLabel')}
                        required
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
