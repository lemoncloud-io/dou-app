import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Loader2, X } from 'lucide-react';

import { useCreatePlace } from '../hooks/useCreatePlace';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';

interface CreatePlaceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const CreatePlaceDialog = ({ open, onOpenChange }: CreatePlaceDialogProps) => {
    const { t } = useTranslation();
    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<{ name: string }>({ mode: 'onChange' });

    const nameValue = watch('name', '');
    const isValidName = nameValue.trim().length >= 2 && nameValue.trim().length <= 20;

    const { createPlace } = useCreatePlace();

    const onSubmit = async (data: { name: string }) => {
        try {
            await createPlace(data.name);
            reset();
            onOpenChange(false);
        } catch {
            // handle error
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="m-0 flex h-full max-h-screen w-full max-w-full flex-col rounded-none bg-white p-0"
                hideClose
                variant="slide-up"
            >
                {/* Top Bar */}
                <div className="flex items-center justify-between bg-white px-1.5 py-3">
                    <div className="h-11 w-11" />
                    <h1 className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-[#171725]">
                        {t('createPlace.title')}
                    </h1>
                    <button onClick={() => onOpenChange(false)} className="flex h-11 w-11 items-center justify-center">
                        <X className="h-6 w-6 text-[#3A3C40]" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-auto">
                    <div className="flex flex-col gap-6 pt-6">
                        {/* Title Section */}
                        <div className="flex flex-col gap-1.5 px-4">
                            <div className="flex flex-col gap-[2px]">
                                <span className="text-[21px] font-semibold leading-[1.35] tracking-[-0.025em] text-black">
                                    {t('createPlace.subtitle1')}
                                </span>
                                <span className="text-[21px] font-semibold leading-[1.35] tracking-[-0.025em] text-black">
                                    {t('createPlace.subtitle2')}
                                </span>
                            </div>
                        </div>

                        {/* Name Input */}
                        <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg px-4">
                            <div className="flex w-full flex-col gap-1.5">
                                <Label className="text-[14px] font-normal leading-[1.571] tracking-[0.005em] text-[#9FA2A7]">
                                    {t('createPlace.nameLabel')}
                                </Label>
                                <Input
                                    {...register('name', {
                                        required: true,
                                        minLength: 2,
                                        maxLength: 20,
                                    })}
                                    placeholder={t('createPlace.namePlaceholder')}
                                    className="h-11 rounded-[10px] border border-[#EAEAEC] bg-white px-3.5 text-[15px] font-medium leading-[1.45] tracking-[0.005em] placeholder:text-[#84888F]"
                                />
                                {errors.name && (
                                    <span className="text-[12px] text-red-500">{t('createPlace.nameHint')}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Button */}
                    <div className="mt-auto">
                        <div className="flex flex-col gap-4 px-4 pb-4 pt-5">
                            <Button
                                type="submit"
                                disabled={!isValidName || isSubmitting}
                                className="flex h-[50px] items-center justify-center gap-1.5 rounded-full bg-[#B0EA10] px-6 py-3 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-[#222325] hover:bg-[#9DD00E] disabled:bg-[#EAEAEC] disabled:text-[#BABCC0]"
                            >
                                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : t('createPlace.done')}
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
