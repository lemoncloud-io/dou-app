import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Loader2, X } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { useCreateChannel } from '../hooks/useCreateChannel';

interface CreateChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete?: () => void;
}

export const CreateChannelDialog = ({ open, onOpenChange, onComplete }: CreateChannelDialogProps) => {
    const { t } = useTranslation();
    const { createChannel, isLoading } = useCreateChannel();
    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors },
    } = useForm<{ name: string }>();

    const nameValue = watch('name', '');
    const isButtonDisabled = isLoading || !nameValue?.trim();

    const onSubmit = async (data: { name: string }) => {
        try {
            await createChannel({ stereo: 'private', name: data.name });
            reset();
            onOpenChange(false);
            onComplete?.();
        } catch {
            // isError handled by hook
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="m-0 max-w-full w-full rounded-none flex flex-col bg-background"
                hideClose
                variant="slide-up"
            >
                <DialogDescription className="sr-only">Create a new channel</DialogDescription>
                {/* Top Bar */}
                <div className="flex items-center justify-between px-1.5 py-3 bg-background">
                    <div className="w-11 h-11" />
                    <DialogTitle className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-foreground">
                        {t('createChannel.title')}
                    </DialogTitle>
                    <button onClick={() => onOpenChange(false)} className="w-11 h-11 flex items-center justify-center">
                        <X className="w-6 h-6 text-foreground" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-auto">
                    <div className="flex flex-col gap-6 pt-6">
                        {/* Title Section */}
                        <div className="flex flex-col gap-1.5 px-4">
                            <div className="flex flex-col justify-center gap-2">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[21px] font-semibold leading-[1.35] tracking-[-0.025em] text-foreground">
                                            {t('createChannel.subtitle1')}
                                        </span>
                                    </div>
                                    <span className="text-[21px] font-semibold leading-[1.35] tracking-[-0.025em] text-foreground">
                                        {t('createChannel.subtitle2')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Form Section */}
                        <div className="flex flex-col justify-center gap-6">
                            {/* Room Name Input */}
                            <div className="flex flex-col justify-center items-center gap-1.5 px-4 rounded-lg">
                                <div className="flex flex-col gap-1.5 w-full">
                                    <Label className="text-[14px] font-normal leading-[1.571] tracking-[0.005em] text-muted-foreground">
                                        {t('createChannel.nameLabel')}
                                    </Label>
                                    <Input
                                        {...register('name', {
                                            required: t('createChannel.nameRequired'),
                                            minLength: { value: 2, message: t('createChannel.nameMinLength') },
                                            maxLength: { value: 20, message: t('createChannel.nameMaxLength') },
                                        })}
                                        placeholder={t('createChannel.namePlaceholder')}
                                        className="h-11 px-3.5 bg-background border border-border rounded-[10px] text-[15px] font-medium leading-[1.45] tracking-[0.005em] text-foreground placeholder:text-muted-foreground"
                                    />
                                    {errors.name && (
                                        <span className="text-[12px] text-destructive">{errors.name.message}</span>
                                    )}
                                </div>
                            </div>

                            {/* Room Image Section */}
                            {/* <div className="flex flex-col gap-1.5 px-[18px]">
                                <Label className="text-[14px] font-semibold leading-[1.571] tracking-[0.005em] text-[#9FA2A7]">
                                    방 이미지 [선택]
                                </Label>
                                <div className="flex flex-col justify-center items-center gap-1.5">
                                    <div className="relative w-[114px] h-[114px]">
                                        <div className="flex items-center justify-center w-[114px] h-[114px] bg-[#F7F7F7] rounded-[14px]">
                                            <div className="w-14 h-14 rounded-full bg-[#53555B]" />
                                        </div>
                                        <div className="absolute bottom-0 right-0 flex items-center justify-center w-[34px] h-[34px] bg-[#B0EA10] rounded-full">
                                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                                <path
                                                    d="M0.833984 12.5L2.50065 10.8333L7.50065 15.8333L17.5007 5.83333L19.1673 7.5L7.50065 19.1667L0.833984 12.5Z"
                                                    fill="white"
                                                />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div> */}
                        </div>
                    </div>

                    {/* Bottom Button */}
                    <div className="mt-auto">
                        <div className="flex flex-col gap-4 px-4 pt-5 pb-4">
                            <Button
                                type="submit"
                                disabled={isButtonDisabled}
                                className="flex items-center justify-center gap-1.5 h-[50px] px-6 py-3 bg-[#B0EA10] rounded-full text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-[#222325] hover:bg-[#9DD00E] disabled:bg-muted disabled:text-muted-foreground"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : t('createChannel.done')}
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
