import { useState } from 'react';

import { ChevronLeft, Info, X } from 'lucide-react';

import { ChatButton } from '@lemon/ui-kit';

export const OtherChatInfoPage = () => {
    const [value, setValue] = useState('');

    return (
        <div className="flex flex-col min-h-screen bg-background text-sm">
            <header className="fixed top-0 w-full h-[52px] bg-white flex items-center py-3 px-4">
                <button>
                    <ChevronLeft size={24} strokeWidth={1.6} />
                </button>
                <div className="text-[#3A3C40] font-medium flex-1 flex justify-center mr-6 text-base">채팅방 정보</div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 pt-[52px] flex flex-col pb-32">
                <div className="py-[14px]">
                    <label htmlFor="" className="text-chatic-text-700 font-medium mb-[9px] flex items-center gap-[7px]">
                        방 이름
                        <div className="flex items-center gap-1 text-chatic-text-600 text-xs">
                            <Info className="w-4 h-4" strokeWidth={1.5} />
                            내가 설정한 방 이름은 나에게만 표시됩니다.
                        </div>
                    </label>
                    <div className="flex items-center justify-between gap-1 border-b border-[#DFE0E2]">
                        <input
                            type="text"
                            placeholder="설정된 방 이름으로 노출"
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
                <div className="h-[1px] bg-chatic-50 -mx-4 my-[10px]"></div>

                <div className="mb-2 font-medium text-chatic-text-700">방 용도</div>
                <div className="flex flex-col space-y-4">
                    <div className="py-[10px] px-[14px] bg-white rounded-xl shadow-chatic">
                        <label htmlFor="" className="font-semibold inline-block mb-1">
                            관계 중심
                        </label>
                        <div className="flex flex-col space-y-[6px]">
                            {[
                                { label: '커플 👩‍❤️‍👨', value: 'couple' },
                                { label: '가족 👨‍👩‍👦‍👦', value: 'family' },
                                { label: '직장 동료 💼', value: 'coworker' },
                            ].map(option => (
                                <div key={option.value} className="flex items-center justify-between">
                                    <span className="flex-1 font-medium">{option.label}</span>
                                    <label className="relative flex items-center justify-center w-5 h-5 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="relationship"
                                            value={option.value}
                                            className="peer appearance-none w-5 h-5 rounded-full border-[1.5px] border-chatic-300 checked:border-chatic-primary checked:bg-white"
                                        />
                                        <span className="absolute w-[11px] h-[11px] rounded-full bg-chatic-primary scale-0 peer-checked:scale-100 transition-transform" />
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="fixed bottom-0 w-full flex justify-center bg-white pb-4">
                <div
                    className="absolute -top-7 left-0 w-full h-7 pointer-events-none"
                    style={{
                        background:
                            'linear-gradient(180deg, rgba(255, 255, 255, 0.01) 0%, rgba(255, 255, 255, 0.48) 29.37%, rgba(255, 255, 255, 0.80) 58.93%, #FFF 100%)',
                    }}
                />
                <ChatButton disabled>완료</ChatButton>
            </div>
        </div>
    );
};
