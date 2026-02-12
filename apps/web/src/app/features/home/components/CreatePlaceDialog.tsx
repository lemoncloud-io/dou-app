import { HelpCircle, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent } from '@chatic/ui-kit/components/ui/dialog';

interface CreatePlaceFormData {
    name: string;
}

interface CreatePlaceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const CreatePlaceDialog = ({ open, onOpenChange }: CreatePlaceDialogProps) => {
    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
        reset,
    } = useForm<CreatePlaceFormData>();
    const [isLoading, setIsLoading] = useState(false);

    const nameValue = watch('name', '');

    const onSubmit = async (data: CreatePlaceFormData) => {
        setIsLoading(true);
        try {
            console.log('Create place:', data);
            // TODO: API 연동
            onOpenChange(false);
            reset();
        } catch (error) {
            console.error('Failed to create place:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="h-screen max-w-full w-full m-0 p-0 rounded-none flex flex-col">
                {/* Top Bar */}
                <div className="flex items-center justify-between px-1.5 py-3 bg-white">
                    <div className="w-11 h-11" />
                    <h1 className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-[#222325]">
                        플레이스 만들기
                    </h1>
                    <button onClick={() => onOpenChange(false)} className="w-11 h-11 flex items-center justify-center">
                        <X className="w-6 h-6 text-[#3A3C40]" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col">
                    <div className="flex-1 overflow-auto flex flex-col gap-[26px] pt-[15px]">
                        {/* Title Section */}
                        <div className="flex flex-col gap-2 px-4">
                            <div className="flex flex-col gap-[5px]">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[20px] font-semibold leading-[1.35] tracking-[-0.025em] text-black">
                                        나만의 공간 플레이스를
                                    </span>
                                    <span className="text-[20px] font-semibold leading-[1.35] tracking-[-0.025em] text-black">
                                        설정해 주세요
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <HelpCircle className="w-[18px] h-[18px] text-[#90C304]" />
                                <span className="text-[14px] font-medium leading-[1.45] tracking-[-0.015em] text-[#84888F]">
                                    플레이스에 대한 내용으로 ~~~
                                </span>
                            </div>
                        </div>

                        {/* Form Fields */}
                        <div className="flex flex-col gap-5 px-4">
                            {/* Place Name Input */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[14px] font-semibold leading-[1.29] tracking-[0.005em] text-[#53555B]">
                                    플레이스 이름
                                </label>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between px-3 py-3 bg-white border border-[#EAEAEC] rounded-[10px]">
                                        <input
                                            {...register('name', {
                                                required: true,
                                                maxLength: 20,
                                            })}
                                            placeholder="예: 나만의 공간, 독서 모임 등"
                                            className="flex-1 bg-transparent border-0 outline-none text-[16px] font-normal leading-[1.45] tracking-[-0.015em] text-[#BABCC0] placeholder:text-[#BABCC0]"
                                        />
                                        <div className="flex items-center gap-0 opacity-70">
                                            <span className="text-[13px] font-medium leading-[1.38] tracking-[0.019em] text-[#53555B]">
                                                {nameValue.length}
                                            </span>
                                            <span className="text-[13px] font-medium leading-[1.38] tracking-[0.019em] text-[#53555B]">
                                                /
                                            </span>
                                            <span className="text-[13px] font-medium leading-[1.38] tracking-[0.019em] text-[#53555B]">
                                                20
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-[12px] font-medium leading-[1.5] text-[#84888F] pl-0.5">
                                        20글자 이내로 입력해 주세요.
                                    </span>
                                </div>
                            </div>

                            {/* Place Photo */}
                            <div className="flex flex-col gap-2.5 px-0.5">
                                <div className="flex items-center gap-[3px]">
                                    <span className="text-[14px] font-semibold leading-[1.29] tracking-[0.005em] text-[#53555B]">
                                        플레이스 사진
                                    </span>
                                    <span className="text-[13px] font-medium leading-[1.38] tracking-[0.005em] text-[#BABCC0]">
                                        [선택]
                                    </span>
                                </div>
                                <div className="w-[86px] h-[86px] flex items-center justify-center bg-[#F7F7F7] border border-[#F4F5F5] rounded-2xl">
                                    <div className="w-9 h-9 text-[#1E1E1E]">📷</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Button */}
                    <div className="px-4 pt-5 pb-4">
                        <Button
                            type="submit"
                            disabled={!nameValue.trim() || isLoading}
                            className="w-full h-[50px] bg-[#EAEAEC] text-[#BABCC0] hover:bg-[#EAEAEC] disabled:opacity-100 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] rounded-full"
                        >
                            완료
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
