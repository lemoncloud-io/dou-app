import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { Textarea } from '@chatic/ui-kit/components/ui/textarea';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

/**
 * Safety nets, not product limits: a report also carries a device snapshot, so an unbounded paste
 * could fail the whole submission at the server instead of just being long. The body cap matches
 * the one the web feedback screen uses.
 */
const TITLE_MAX = 100;
const BODY_MAX = 5000;

interface ReportIssueDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * "Report a problem": a title and a description, sent through `runtime.report.reportIssue`, which
 * adds who sent it, the cloud, the page URL and the environment. Both fields are required. A
 * failure keeps the dialog open with what was typed, so the report is not lost.
 */
export const ReportIssueDialog = ({ open, onOpenChange }: ReportIssueDialogProps) => {
    const { t } = useTranslation();
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // A fresh form each time the dialog opens; a failed send keeps its text until it is closed.
    useEffect(() => {
        if (open) {
            setTitle('');
            setBody('');
            setErrorMsg(null);
        }
    }, [open]);

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    const isValid = trimmedTitle.length > 0 && trimmedBody.length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSending || !isValid) return;
        setIsSending(true);
        setErrorMsg(null);
        try {
            await runtime.report.reportIssue(trimmedTitle, trimmedBody, {
                online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
                viewport: { width: window.innerWidth, height: window.innerHeight },
                path: window.location.pathname,
            });
            toast({ title: t('settings.report.success') });
            onOpenChange(false);
        } catch (error) {
            logger.error('FEEDBACK', 'Failed to send a problem report', { error });
            setErrorMsg(t('settings.report.failed'));
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !isSending && onOpenChange(next)}>
            <DialogContent closeLabel={t('common.close')} aria-describedby={undefined} className="sm:max-w-md">
                <DialogTitle>{t('settings.report.title')}</DialogTitle>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="report-title">{t('settings.report.titleLabel')}</Label>
                        <Input
                            id="report-title"
                            autoFocus
                            value={title}
                            maxLength={TITLE_MAX}
                            onChange={e => setTitle(e.target.value)}
                            placeholder={t('settings.report.titlePlaceholder')}
                            disabled={isSending}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="report-body">{t('settings.report.bodyLabel')}</Label>
                        <Textarea
                            id="report-body"
                            rows={6}
                            value={body}
                            maxLength={BODY_MAX}
                            onChange={e => setBody(e.target.value)}
                            placeholder={t('settings.report.bodyPlaceholder')}
                            disabled={isSending}
                        />
                    </div>

                    {errorMsg && (
                        <p className="text-callout text-destructive break-words" role="alert">
                            {errorMsg}
                        </p>
                    )}

                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSending}
                        >
                            {t('settings.report.cancel')}
                        </Button>
                        <Button type="submit" disabled={isSending || !isValid}>
                            {isSending ? t('settings.report.sending') : t('settings.report.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
