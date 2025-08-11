import { useState } from 'react';

import { ChevronDown, X } from 'lucide-react';

import { BrandHeader, ChatButton, Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@lemon/ui-kit';

const options = [
    {
        label: '친절한 조력자형+공손한 말투',
        example: '예시 : 안녕하세요. 궁금한게 있으면 언제든 편하게 물어봐 주세요.',
        value: 'kind_helper_polite',
    },
    {
        label: '조언가형+직설적인 말투',
        example: '예시 : 할 말이 있으면 바로바로 말해 주세요.',
        value: 'advisor_direct',
    },
    {
        label: '유머러스형+친근한 말투',
        example: '예시 : 농담도 잘 던지고 분위기를 띄웁니다!',
        value: 'humorous_friendly',
    },
];

export const AgentFormPage = () => {
    const [value, setValue] = useState('');

    return (
        <div className="flex flex-col bg-background">
            <BrandHeader />
            <div className="flex-1 overflow-y-auto px-4 pb-32 pt-16 text-sm">
                <div className="mb-5">이제 나만의 에이전트를 만들어 보세요!</div>
                <div className="flex flex-col space-y-4">
                    <div className="py-3 px-[14px] bg-white rounded-xl shadow-chatic border border-transparent transition-all duration-200 focus-within:border focus-within:border-[#3968C3]">
                        <label htmlFor="" className="text-chatic-text-700 font-medium inline-block mb-[9px]">
                            이름<span className="text-destructive">*</span>
                        </label>
                        <div className="flex items-center justify-between gap-1 border-b border-[#DFE0E2]">
                            <input
                                type="text"
                                placeholder="이름을 입력해 주세요."
                                className="pb-[6px]  w-full focus:outline-none"
                                maxLength={10}
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
                        <div className="text-xs text-chatic-text-500 mt-1">3~10글자 이내로 입력해 주세요.</div>
                    </div>
                    <div className="py-3 px-[14px] bg-white rounded-xl shadow-chatic border border-transparent transition-all duration-200 focus-within:border focus-within:border-[#3968C3]">
                        <label htmlFor="" className="text-chatic-text-700 font-medium inline-block mb-[9px]">
                            나이<span className="text-destructive">*</span>
                        </label>
                        <div className="flex items-center justify-between gap-1 border-b border-[#DFE0E2]">
                            <input
                                type="number"
                                placeholder="나이를 입력해 주세요."
                                className="pb-[6px]  w-full focus:outline-none"
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
                        <div className="text-xs text-chatic-text-500 mt-1">숫자로만 입력해 주세요.</div>
                    </div>
                    <div className="py-3 px-[14px] bg-white rounded-xl shadow-chatic border border-transparent">
                        <label htmlFor="" className="text-chatic-text-700 font-medium inline-block mb-[9px]">
                            MBTI<span className="text-destructive">*</span>
                        </label>
                        <Sheet>
                            <SheetTrigger asChild>
                                <button className="flex items-center justify-between w-full pb-[6px] border-b border-[#DFE0E2]">
                                    <input type="text" placeholder="MBTI를 선택해 주세요." />
                                    <ChevronDown size={16} />
                                </button>
                            </SheetTrigger>
                            <SheetContent side="bottom" className="px-4 rounded-t-xl py-0 max-h-[90vh] h-full">
                                <SheetHeader className="sticky top-0 z-5 bg-white flex-row items-center justify-between py-4 space-y-0">
                                    <SheetTitle className="text-base font-medium">MBTI 선택</SheetTitle>
                                </SheetHeader>
                                <ul className="flex flex-col divide-y divide-chatic-50 h-full overflow-auto scrollbar-hide">
                                    {[
                                        'ISTJ',
                                        'ISFJ',
                                        'INFJ',
                                        'INTJ',
                                        'ISTP',
                                        'ISFP',
                                        'INFP',
                                        'INTP',
                                        'ESTP',
                                        'ESFP',
                                        'ENFP',
                                        'ENTP',
                                        'ESTJ',
                                        'ESFJ',
                                        'ENFJ',
                                        'ENTJ',
                                    ].map(mbti => (
                                        <li key={mbti} className="flex items-center justify-between py-4">
                                            <span className="flex-1 text-[15px] font-medium">{mbti}</span>

                                            <label className="relative flex items-center justify-center w-5 h-5 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="mbti"
                                                    value={mbti}
                                                    className="peer appearance-none w-5 h-5 rounded-full border-[1.5px] border-chatic-300 checked:border-chatic-primary checked:bg-white"
                                                />
                                                <span className="absolute w-[11px] h-[11px] rounded-full bg-chatic-primary scale-0 peer-checked:scale-100 transition-transform" />
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            </SheetContent>
                        </Sheet>
                    </div>
                    <div className="py-3 px-[14px] bg-white rounded-xl shadow-chatic">
                        <label htmlFor="" className="text-chatic-text-700 font-medium inline-block">
                            에이전트 스타일<span className="text-destructive">*</span>
                        </label>
                        <ul className="flex flex-col divide-y divide-chatic-50">
                            {options.map(({ label, example, value }) => (
                                <li key={value} className="flex flex-col gap-[3px] py-[9px]">
                                    <div className="flex items-center justify-between">
                                        <span className="flex-1 font-medium text-chatic-800">{label}</span>
                                        <label className="relative flex items-center justify-center w-5 h-5 cursor-pointer text-chatic-700">
                                            <input
                                                type="radio"
                                                name="tone"
                                                value={value}
                                                className="peer appearance-none w-5 h-5 rounded-full border-[1.5px] border-chatic-300 checked:border-chatic-primary checked:bg-white"
                                            />
                                            <span className="absolute w-[11px] h-[11px] rounded-full bg-chatic-primary scale-0 peer-checked:scale-100 transition-transform" />
                                        </label>
                                    </div>
                                    <div className="text-[13px] text-chatic-text-700">{example}</div>
                                </li>
                            ))}
                        </ul>
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
