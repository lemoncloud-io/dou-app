import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useDeviceInfo } from '@chatic/device-utils';
import { reportIssue } from '@chatic/web-core';
import { Button, IconButton, IconClose, TextField } from '@chatic/web-ui-kit';
import { Textarea } from '@chatic/ui-kit/components/ui/textarea';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { type Position, getViewportSize, useDraggable } from '../hooks';
import { buildReportContext } from '../lib';

const TITLE_MAX_LENGTH = 100;
/** Cap the free-text body so a large paste can't bloat the report payload. */
const BODY_MAX_LENGTH = 2000;
/** Overlay panel width (px), matching w-[min(92vw,22rem)] ≈ 352px. */
const PANEL_WIDTH = 352;

/** Default resting spot: roughly centered horizontally, biased toward the top. */
const getDefaultPosition = (): Position => {
    const { width } = getViewportSize();
    const vw = width || 375;
    return { x: Math.max(16, vw / 2 - PANEL_WIDTH / 2), y: 96 };
};

interface IssueReportOverlayProps {
    onClose: () => void;
}

/**
 * Draggable issue-report form panel. Composes web-ui-kit inputs (TextField for
 * the title, ui-kit Textarea for the multiline body — web-ui-kit has no
 * multiline field) and submits via the extended `reportIssue`, auto-attaching
 * recent logs + a device/version snapshot.
 */
export const IssueReportOverlay = ({ onClose }: IssueReportOverlayProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { deviceInfo, versionInfo } = useDeviceInfo();
    const setIssueReportHidden = usePreferenceStore(s => s.setIssueReportHidden);
    const { ref, position, dragHandlers, didDrag } = useDraggable('issue-report:overlay', getDefaultPosition);

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
            toast({ title: t('issueReport.success') });
            setTitle('');
            setBody('');
            onClose();
        } catch (error) {
            logger.error('ISSUE_REPORT', 'Failed to submit issue report', { error });
            toast({ title: t('issueReport.failed'), variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleHide = () => {
        setIssueReportHidden(true);
        onClose();
    };

    return (
        <div
            ref={ref}
            style={{ left: position.x, top: position.y }}
            className="fixed z-50 flex w-[min(92vw,22rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        >
            {/* Header doubles as the drag handle (mirrors the debug MiniPanel). */}
            <div
                {...dragHandlers}
                className="flex cursor-move touch-none select-none items-center justify-between border-b border-border px-4 py-3"
            >
                <span className="text-sm font-semibold text-foreground">{t('issueReport.title')}</span>
                <IconButton
                    icon={<IconClose />}
                    label={t('issueReport.close')}
                    size={28}
                    onClick={() => {
                        // Ignore the click synthesized after dragging the header onto the X.
                        if (!didDrag()) onClose();
                    }}
                />
            </div>

            <div className="flex flex-col gap-4 p-4">
                <TextField
                    label={t('issueReport.titleLabel')}
                    value={title}
                    onChange={setTitle}
                    placeholder={t('issueReport.titlePlaceholder')}
                    maxLength={TITLE_MAX_LENGTH}
                    disabled={isSubmitting}
                />

                <div className="flex flex-col gap-1.5">
                    <label className="text-[14px] text-muted-foreground">{t('issueReport.bodyLabel')}</label>
                    <Textarea
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        placeholder={t('issueReport.bodyPlaceholder')}
                        maxLength={BODY_MAX_LENGTH}
                        className="min-h-[120px] resize-none"
                        disabled={isSubmitting}
                    />
                </div>

                <Button
                    variant="solid"
                    tone="green"
                    fullWidth
                    loading={isSubmitting}
                    disabled={!isValid || isSubmitting}
                    onClick={handleSubmit}
                >
                    {t('issueReport.submit')}
                </Button>

                <button
                    type="button"
                    onClick={handleHide}
                    className="self-center text-[13px] text-muted-foreground underline"
                >
                    {t('issueReport.hide')}
                </button>
            </div>
        </div>
    );
};
