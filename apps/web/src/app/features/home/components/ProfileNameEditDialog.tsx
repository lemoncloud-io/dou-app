import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Loader2, X } from 'lucide-react';

import { logger } from '@chatic/bridges';
import type { SiteProfileBody, SiteProfileView } from '@chatic/data';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

interface ProfileNameEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentNick?: string;
    updateSiteProfile: (body: SiteProfileBody) => Promise<SiteProfileView>;
}

export const ProfileNameEditDialog = ({
    open,
    onOpenChange,
    currentNick,
    updateSiteProfile,
}: ProfileNameEditDialogProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const {
        register,
        handleSubmit,
        watch,
        reset,
        formState: { errors },
    } = useForm<{ name: string }>({ mode: 'onChange' });

    const nameValue = watch('name', '');
    const isValidName = nameValue.trim().length >= 2;

    useEffect(() => {
        if (open) {
            reset({ name: currentNick ?? '' });
        }
    }, [open, reset, currentNick]);

    const onSubmit = async (data: { name: string }) => {
        try {
            setIsSubmitting(true);
            const trimmedName = data.name.trim();
            await updateSiteProfile({ nick: trimmedName });

            toast({ title: t('profileNameEdit.success') });
            onOpenChange(false);
        } catch (error) {
            logger.error('PROFILE', 'Failed to update site profile name', { error });
            toast({ title: t('profileNameEdit.error'), variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-full max-w-none rounded-none p-0 sm:rounded-none" hideClose>
                <DialogTitle className="sr-only">{t('profileNameEdit.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('profileNameEdit.description')}</DialogDescription>

                <div className="flex h-full flex-col p-6 pt-safe-top">
                    <div className="flex items-center justify-end">
                        <button onClick={() => onOpenChange(false)} className="rounded-full p-1">
                            <X size={24} strokeWidth={2} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col pt-8">
                        <h2 className="text-[22px] font-bold leading-[1.35] tracking-[0.005em]">
                            {t('profileNameEdit.title')}
                        </h2>
                        <p className="mt-2 text-[16px] font-medium leading-[1.45] tracking-[-0.015em] text-[#9FA2A7]">
                            {t('profileNameEdit.description')}
                        </p>

                        <div className="mt-8 flex flex-col gap-1.5">
                            <Label className="text-[14px] font-normal leading-[1.571] tracking-[0.005em] text-muted-foreground">
                                {t('profileNameEdit.nameLabel')}
                            </Label>
                            <Input
                                {...register('name', {
                                    required: t('profileNameEdit.validation.required'),
                                    minLength: {
                                        value: 2,
                                        message: t('profileNameEdit.validation.tooShort'),
                                    },
                                })}
                                placeholder={t('profileNameEdit.placeholder')}
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
                                {isSubmitting ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    t('profileNameEdit.save')
                                )}
                            </Button>
                        </div>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    );
};
