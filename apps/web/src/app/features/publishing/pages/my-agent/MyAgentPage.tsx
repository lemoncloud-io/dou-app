import React from 'react';

import { Check } from 'lucide-react';

import { BrandHeader, ChatButton, ChatInput } from '@lemon/ui-kit';

export const MyAgentPage = () => {
    const chatInputRef = React.useRef<HTMLTextAreaElement>(null);

    return (
        <div className="flex flex-col bg-background">
            <BrandHeader />
            <div className="flex-1 overflow-y-auto px-4 pb-32 pt-16 text-sm">
                안녕! Chatic에 온걸 환영해 😄
                <br />
                채틱이 처음이라면 [<span className="text-[#093281] font-semibold">새로 시작</span>],
                <br />
                이전에 이메일을 등록했다면 [<span className="text-[#093281] font-semibold">이메일 입력</span>]을 선택해
                주세요.
                <div className="mt-8 flex items-center justify-center gap-2">
                    <ChatButton variant="outline">이메일 입력</ChatButton>
                    <ChatButton>새로 시작</ChatButton>
                </div>
                {/* 입력 */}
                <div className="flex justify-end my-2">
                    <div className="max-w-[70%] border-[0.5px] border-chatic-100 bg-chatic-50 rounded-xl text-sm py-[6px] px-3 inline-flex break-all">
                        sunny
                    </div>
                </div>
                <div className="flex justify-end my-2">
                    <div className="max-w-[70%] border-[0.5px] border-destructive text-destructive bg-chatic-50 rounded-xl text-sm py-[6px] px-3 inline-flex break-all">
                        sunny
                    </div>
                </div>
                {/* 그라데이션 텍스트 */}
                <div
                    className="font-semibold"
                    style={{
                        WebkitTextFillColor: 'transparent',
                        backgroundImage: 'linear-gradient(90deg, #0B1933 1.04%, #102F6B 22.28%, #3968C3 45.66%)',
                        backgroundClip: 'text',
                    }}
                >
                    안녕! 난 에이전트'레몬'이야
                </div>
            </div>
            <div className="fixed bottom-0 left-0 right-0 bg-background">
                <ChatInput
                    ref={chatInputRef}
                    validationSlot={
                        <>
                            <div className="flex items-center gap-1 text-xs text-chatic-accent">
                                <Check size={14} strokeWidth={3} className="text-chatic-accent" />
                                <span>3-10 글자 이내</span>
                            </div>
                            <div className="flex items-center gap-[5px]">
                                <Check size={14} strokeWidth={3} className="text-chatic-text-400" />
                                <span className="text-xs font-medium text-chatic-text-400">3-10 글자 이내</span>
                            </div>
                        </>
                    }
                />
            </div>
        </div>
    );
};
