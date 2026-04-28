import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Loader2, X } from 'lucide-react';

import { reportIssue } from '@chatic/web-core';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { Textarea } from '@chatic/ui-kit/components/ui/textarea';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

interface ReportIssueForm {
    title: string;
    message: string;
}

interface ReportIssueDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const ReportIssueDialog = ({ open, onOpenChange }: ReportIssueDialogProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { isSubmitting },
    } = useForm<ReportIssueForm>({ mode: 'onChange' });

    const titleValue = watch('title', '');
    const messageValue = watch('message', '');
    const isValid = titleValue.trim().length >= 1 && messageValue.trim().length >= 1;

    const onSubmit = async (data: ReportIssueForm) => {
        try {
            await reportIssue(data.title.trim(), data.message.trim());
            toast({ title: t('reportIssue.success') });
            reset();
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to report issue:', error);
            toast({ title: t('reportIssue.failed'), variant: 'destructive' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="m-0 flex h-full max-h-screen w-full max-w-full flex-col rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
            >
                <DialogDescription className="sr-only">{t('reportIssue.description')}</DialogDescription>
                {/* Top Bar */}
                <div className="flex items-center justify-between bg-background px-1.5 py-3">
                    <div className="h-11 w-11" />
                    <DialogTitle className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-foreground">
                        {t('reportIssue.title')}
                    </DialogTitle>
                    <button onClick={() => onOpenChange(false)} className="flex h-11 w-11 items-center justify-center">
                        <X className="h-6 w-6 text-foreground" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-auto">
                    <div className="flex flex-col gap-6 pt-6">
                        {/* Description */}
                        <div className="flex flex-col gap-1.5 px-4">
                            <span className="text-[14px] font-normal leading-[1.571] tracking-[0.005em] text-muted-foreground">
                                {t('reportIssue.description')}
                            </span>
                        </div>

                        {/* Title Input */}
                        <div className="flex flex-col gap-1.5 px-4">
                            <Label className="text-[14px] font-normal leading-[1.571] tracking-[0.005em] text-muted-foreground">
                                {t('reportIssue.titleLabel')}
                            </Label>
                            <Input
                                {...register('title', { required: true })}
                                placeholder={t('reportIssue.titlePlaceholder')}
                                className="h-11 rounded-[10px] border border-border bg-background px-3.5 text-[15px] font-medium leading-[1.45] tracking-[0.005em] text-foreground placeholder:text-muted-foreground"
                                disabled={isSubmitting}
                            />
                        </div>

                        {/* Message Textarea */}
                        <div className="flex flex-col gap-1.5 px-4">
                            <Label className="text-[14px] font-normal leading-[1.571] tracking-[0.005em] text-muted-foreground">
                                {t('reportIssue.messageLabel')}
                            </Label>
                            <Textarea
                                {...register('message', { required: true })}
                                placeholder={t('reportIssue.messagePlaceholder')}
                                className="min-h-[140px] resize-none rounded-[10px] border border-border bg-background px-3.5 py-3 text-[15px] font-medium leading-[1.45] tracking-[0.005em] text-foreground placeholder:text-muted-foreground"
                                disabled={isSubmitting}
                            />
                        </div>
                    </div>

                    {/* Bottom Button */}
                    <div className="mt-auto">
                        <div className="flex flex-col gap-4 px-4 pb-4 pt-5">
                            <Button
                                type="submit"
                                disabled={!isValid || isSubmitting}
                                className="flex h-[50px] items-center justify-center gap-1.5 rounded-full bg-[#B0EA10] px-6 py-3 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-[#222325] hover:bg-[#9DD00E] disabled:bg-muted disabled:text-muted-foreground"
                            >
                                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : t('reportIssue.submit')}
                            </Button>
                        </div>
                        <div
                            className="shrink-0 touch-none bg-background"
                            style={{ height: 'var(--keyboard-height, 0px)' }}
                            onTouchMove={e => e.preventDefault()}
                        />
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
