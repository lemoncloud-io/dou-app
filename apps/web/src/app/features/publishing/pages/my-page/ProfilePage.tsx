import { useState } from 'react';

import { Camera, ChevronLeft, X } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage, ChatButton } from '@lemon/ui-kit';

export const ProfilePage = () => {
    const [value, setValue] = useState('');

    return (
        <div className="flex flex-col min-h-screen bg-background text-sm">
            <header className="fixed top-0 w-full h-[52px] bg-white flex items-center py-3 px-4">
                <button>
                    <ChevronLeft size={24} strokeWidth={1.6} />
                </button>
                <div className="text-[#3A3C40] font-medium flex-1 flex justify-center mr-6 text-base">프로필 설정</div>
            </header>

            <div className="flex-1 overflow-y-auto pt-[52px] px-4 flex flex-col pb-4">
                <div className="py-[18px] flex flex-col justify-center items-center gap-[6px]">
                    <button>
                        <Avatar className="w-[68px] h-[68px] bg-chatic-50">
                            <AvatarImage src="" alt="사용자 프로필 이미지" />
                            <AvatarFallback>
                                <Camera strokeWidth={1.5} className="w-6 h-6 text-chatic-text-500" aria-hidden />
                            </AvatarFallback>
                        </Avatar>
                    </button>
                    <div className="text-sm font-medium text-chatic-text-600">프로필 사진 변경</div>
                </div>
                <div className="mt-[14px]">
                    <label htmlFor="" className=" font-medium inline-block mb-[9px]">
                        닉네임
                    </label>
                    <div className="flex items-center justify-between gap-1 border-b border-[#DFE0E2]">
                        <input
                            type="text"
                            placeholder="기존 닉네임으로 표시"
                            className="pb-[6px] w-full focus:outline-none"
                            maxLength={10}
                            value={value}
                            onChange={e => setValue(e.target.value)}
                        />
                        {value && (
                            <button
                                onClick={() => setValue('')}
                                className="shrink-0 bg-chatic-text-600 w-5 h-5 rounded-full flex items-center justify-center"
                            >
                                <X className="text-white" size={14} />
                            </button>
                        )}
                    </div>
                    <div className="text-xs text-chatic-text-500 mt-1">3~10글자 이내로 입력해 주세요.</div>
                    <div className="text-xs text-destructive mt-1">3~10글자 이내로 입력해 주세요.</div>
                </div>

                <div className="flex justify-center mt-9">
                    <ChatButton disabled>저장</ChatButton>
                </div>
            </div>
        </div>
    );
};
