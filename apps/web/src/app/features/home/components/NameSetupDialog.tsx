import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Loader2 } from 'lucide-react';

import { logger } from '@chatic/bridges';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useSiteProfile } from '../../../shared/hooks';

interface NameSetupDialogProps {
    open: boolean;
    onComplete: () => void;
}

export const NameSetupDialog = ({ open, onComplete }: NameSetupDialogProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { updateSiteProfile } = useSiteProfile();

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<{ name: string }>({ mode: 'onChange' });

    const nameValue = watch('name', '');
    const isValidName = nameValue.trim().length >= 2;

    const onSubmit = async (data: { name: string }) => {
        try {
            setIsSubmitting(true);
            await updateSiteProfile({ nick: data.name.trim() });
            onComplete();
        } catch (error) {
            logger.error('PROFILE', 'Failed to set site profile name', { error });
            toast({ title: t('nameSetup.validation.required'), variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        <Dialog open={open} onOpenChange={() => {}}>
            <DialogContent className="h-full max-w-none rounded-none p-0 sm:rounded-none" hideClose>
                <DialogTitle className="sr-only">{t('nameSetup.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('nameSetup.description')}</DialogDescription>

                <div className="flex h-full flex-col p-6 pt-safe-top">
                    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col pt-8">
                        <h2 className="text-[22px] font-bold leading-[1.35] tracking-[0.005em]">
                            {t('nameSetup.title')}
                        </h2>
                        <p className="mt-2 text-[16px] font-medium leading-[1.45] tracking-[-0.015em] text-[#9FA2A7]">
                            {t('nameSetup.description')}
                        </p>

                        <div className="mt-8 flex flex-col gap-1.5">
                            <Input
                                {...register('name', {
                                    required: t('nameSetup.validation.required'),
                                    minLength: {
                                        value: 2,
                                        message: t('nameSetup.validation.tooShort'),
                                    },
                                })}
                                placeholder={t('nameSetup.placeholder')}
                                className="h-11 rounded-[10px] border border-border bg-background px-3.5 text-[15px] font-medium leading-[1.45] tracking-[0.005em] text-foreground placeholder:text-muted-foreground"
                                autoFocus
                            />
                            {errors.name && <span className="text-[12px] text-destructive">{errors.name.message}</span>}
                        </div>

                        <div className="mt-auto flex flex-col gap-3 pb-safe-bottom">
                            <Button
                                type="submit"
                                disabled={!isValidName || isSubmitting}
                                className="flex h-[50px] items-center justify-center gap-1.5 rounded-full bg-[#B0EA10] px-6 py-3 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-[#222325] hover:bg-[#9DD00E] disabled:bg-muted disabled:text-muted-foreground"
                            >
                                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : t('nameSetup.save')}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={onComplete}
                                className="flex h-[50px] items-center justify-center text-[16px] font-medium text-muted-foreground"
                            >
                                {t('nameSetup.skip')}
                            </Button>
                        </div>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    );
};
