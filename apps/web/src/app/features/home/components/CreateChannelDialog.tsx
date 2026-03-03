import { useForm } from 'react-hook-form';

import { Loader2, X } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { useCreateChannel } from '../hooks/useCreateChannel';
import type { ChannelBody, ChannelStereo } from '@lemoncloud/chatic-socials-api';

const STEREO_OPTIONS: { value: ChannelStereo; label: string }[] = [
    { value: 'public', label: '공개' },
    { value: 'private', label: '나와의 채팅' },
    { value: 'dm', label: 'DM' },
];

interface CreateChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete?: () => void;
}

export const CreateChannelDialog = ({ open, onOpenChange, onComplete }: CreateChannelDialogProps) => {
    const { createChannel, isLoading } = useCreateChannel();
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<{ name: string; desc?: string; stereo: ChannelStereo }>({ defaultValues: { stereo: 'public' } });

    const onSubmit = async (data: ChannelBody) => {
        try {
            await createChannel({ stereo: data.stereo ?? 'public', name: data.name, desc: data.desc });
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
                className="m-0 max-w-full w-full rounded-none flex flex-col bg-white"
                hideClose
                variant="fullscreen"
            >
                {/* Top Bar */}
                <div className="flex items-center justify-between px-1.5 py-3 bg-white">
                    <div className="w-11 h-11" />
                    <h1 className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-[#171725]">
                        새 채팅
                    </h1>
                    <button onClick={() => onOpenChange(false)} className="w-11 h-11 flex items-center justify-center">
                        <X className="w-6 h-6 text-[#3A3C40]" />
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
                                        <span className="text-[21px] font-semibold leading-[1.35] tracking-[-0.025em] text-black">
                                            친구와 채팅할 방을
                                        </span>
                                    </div>
                                    <span className="text-[21px] font-semibold leading-[1.35] tracking-[-0.025em] text-black">
                                        설정해 주세요
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Form Section */}
                        <div className="flex flex-col justify-center gap-6">
                            {/* Stereo Select */}
                            <div className="flex flex-col justify-center items-center gap-1.5 px-4 rounded-lg">
                                <div className="flex flex-col gap-1.5 w-full">
                                    <Label className="text-[14px] font-normal leading-[1.571] tracking-[0.005em] text-[#9FA2A7]">
                                        채널 유형
                                    </Label>
                                    <div className="flex gap-2">
                                        {STEREO_OPTIONS.map(option => (
                                            <label
                                                key={option.value}
                                                className="flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <input
                                                    type="radio"
                                                    value={option.value}
                                                    {...register('stereo')}
                                                    className="w-4 h-4 accent-[#102346]"
                                                />
                                                <span className="text-[14px] font-medium text-[#3A3C40]">
                                                    {option.label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Room Name Input */}
                            <div className="flex flex-col justify-center items-center gap-1.5 px-4 rounded-lg">
                                <div className="flex flex-col gap-1.5 w-full">
                                    <Label className="text-[14px] font-normal leading-[1.571] tracking-[0.005em] text-[#9FA2A7]">
                                        방 이름
                                    </Label>
                                    <Input
                                        {...register('name', {
                                            required: '방 이름을 입력해주세요',
                                            minLength: { value: 2, message: '최소 2자 이상 입력해주세요' },
                                            maxLength: { value: 20, message: '최대 20자까지 입력 가능합니다' },
                                        })}
                                        placeholder="예: UIUX 스터디 방"
                                        className="h-11 px-3.5 bg-white border border-[#EAEAEC] rounded-[10px] text-[15px] font-medium leading-[1.45] tracking-[0.005em] placeholder:text-[#84888F]"
                                    />
                                    {errors.name && (
                                        <span className="text-[12px] text-red-500">{errors.name.message}</span>
                                    )}
                                </div>
                            </div>

                            {/* Room Description Input */}
                            <div className="flex flex-col justify-center items-center gap-1.5 px-4 rounded-lg">
                                <div className="flex flex-col gap-1.5 w-full">
                                    <Label className="text-[14px] font-normal leading-[1.571] tracking-[0.005em] text-[#9FA2A7]">
                                        방 설명
                                    </Label>
                                    <Input
                                        {...register('desc')}
                                        placeholder="예: UIUX 스터디를 위한 방입니다"
                                        className="h-11 px-3.5 bg-white border border-[#EAEAEC] rounded-[10px] text-[15px] font-medium leading-[1.45] tracking-[0.005em] placeholder:text-[#84888F]"
                                    />
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
                                disabled={isLoading}
                                className="flex items-center justify-center gap-1.5 h-[50px] px-6 py-3 bg-[#B0EA10] rounded-full text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-[#222325] hover:bg-[#9DD00E] disabled:bg-[#EAEAEC] disabled:text-[#BABCC0]"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '완료'}
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
