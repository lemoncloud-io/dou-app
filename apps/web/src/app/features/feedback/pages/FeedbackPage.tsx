import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useDeviceInfo } from '@chatic/device-utils';
import { useNavigateWithTransition } from '@chatic/shared';
import { reportIssue } from '@chatic/web-core';
import { FloatingButton, TextField, Textarea } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { PageHeader } from '../../../ui/components';
import { KeyboardAwareLayout } from '../../../ui/layouts';
import { buildReportContext } from '../lib';

/**
 * Safety net, not a product limit. No counter is shown and the design asks for
 * no cap, but the report ships alongside 50 log entries and a device snapshot —
 * an unbounded paste would fail the whole submission at the server instead of
 * just being long.
 */
const MAX_INPUT_LENGTH = 5000;

/**
 * "의견 보내기" — the single entry point for user feedback, reached from the
 * MyPage menu. Submits through `reportIssue`, which auto-attaches recent logs, a
 * device/version snapshot and the route trail (see `buildReportContext`).
 *
 * Photo attachment is intentionally absent: there is no image upload API yet, so
 * the section is not rendered at all rather than shown inert (ADR-0047).
 */
export const FeedbackPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const { deviceInfo, versionInfo } = useDeviceInfo();

    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isValid = title.trim().length > 0 && body.trim().length > 0;

    const handleSubmit = async () => {
        if (!isValid || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const extras = buildReportContext({ deviceInfo, versionInfo });
            await reportIssue(title.trim(), body.trim(), extras);
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
            header={<PageHeader title={t('feedback.title')} />}
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
                </div>
            </div>
        </KeyboardAwareLayout>
    );
};
