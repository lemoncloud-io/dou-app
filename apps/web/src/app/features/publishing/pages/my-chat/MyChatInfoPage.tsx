import { useState } from 'react';

import { ChevronLeft, X } from 'lucide-react';
import { toast } from 'sonner';

import { ChatButton } from '@lemon/ui-kit';

export const MyChatInfoPage = () => {
    const [value, setValue] = useState('');

    return (
        <div className="flex flex-col min-h-screen bg-background text-sm">
            <header className="fixed top-0 w-full h-[52px] bg-white flex items-center py-3 px-4">
                <button>
                    <ChevronLeft size={24} strokeWidth={1.6} />
                </button>
                <div className="text-[#3A3C40] font-medium flex-1 flex justify-center mr-6 text-base">채팅방 정보</div>
            </header>

            <div className="flex-1 overflow-y-auto pt-[52px] px-4 mt-[14px] flex flex-col pb-4">
                <div className="flex-1">
                    <label htmlFor="" className=" font-medium inline-block mb-[9px]">
                        방 이름
                    </label>
                    <div className="flex items-center justify-between gap-1 border-b border-[#DFE0E2]">
                        <input
                            type="text"
                            placeholder="닉네임으로 노출"
                            className="pb-[6px] w-full focus:outline-none"
                            maxLength={20}
                            value={value}
                            onChange={e => setValue(e.target.value)}
                        />
                        {value && (
                            <button
                                onClick={() => setValue('')}
                                className="shrink-0 bg-chatic-600 w-5 h-5 rounded-full flex items-center justify-center"
                            >
                                <X className="text-white" size={14} />
                            </button>
                        )}
                    </div>
                    <div className="text-xs text-chatic-text-500 mt-1">3~20글자 이내로 입력해 주세요.</div>
                </div>

                <div className="flex justify-center">
                    <ChatButton
                        onClick={() =>
                            toast('채팅방 정보가 변경되었습니다.', {
                                style: {
                                    backgroundColor: 'hsl(var(--chatic-800))',
                                    color: 'white',
                                },
                            })
                        }
                    >
                        토스트
                    </ChatButton>
                </div>
            </div>
        </div>
    );
};
