import { useState } from 'react';

import { ChevronLeft, X } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    ChatButton,
} from '@lemon/ui-kit';

export const EmailRegisterPage = () => {
    const [value, setValue] = useState('');

    return (
        <div className="flex flex-col min-h-screen bg-background text-sm">
            <header className="fixed top-0 w-full h-[52px] bg-white flex items-center py-3 px-4">
                <button>
                    <ChevronLeft size={24} strokeWidth={1.6} />
                </button>
                <div className="text-[#3A3C40] font-medium flex-1 flex justify-center mr-6 text-base">이메일 등록</div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 pt-[52px]">
                <div className="text-chatic-text-800 font-medium text-base mt-3">
                    이메일을 등록하면 대화 내용이 복구됩니다.
                </div>
                <div className="mt-[26px] flex flex-col space-y-[18px]">
                    <div>
                        <label htmlFor="" className="text-chatic-text-700 font-medium inline-block mb-[9px]">
                            이메일
                        </label>
                        <div className="flex items-center justify-between gap-1 border-b border-[#DFE0E2]">
                            <input
                                type="text"
                                placeholder="이메일을 입력해 주세요"
                                className="pb-[6px] w-full focus:outline-none"
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
                            <button className="shrink-0 px-[6px] h-[22px] border border-chatic-400 rounded-[16px] text-xs text-chatic-400 font-medium">
                                인증요청
                            </button>
                            <button className="shrink-0 px-[6px] h-[22px] border border-[#093281] rounded-[16px] text-xs text-[#093281] font-medium">
                                인증요청
                            </button>
                        </div>
                        <div className="text-xs text-chatic-text-500 mt-1">이메일 형식으로 입력해 주세요.</div>
                    </div>
                    <div>
                        <label htmlFor="" className="text-chatic-text-700 font-medium inline-block mb-[9px]">
                            인증코드
                        </label>
                        <div className="flex items-center justify-between gap-1 border-b border-[#DFE0E2]">
                            <input
                                type="text"
                                placeholder="인증코드를 입력해 주세요"
                                className="pb-[6px] w-full focus:outline-none"
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
                            <div className="text-destructive text-xs font-medium">00:59</div>
                        </div>
                        <div className="text-xs text-chatic-text-500 mt-1">숫자로만 입력해 주세요.</div>
                        <div className="text-xs text-destructive mt-1">숫자로만 입력해 주세요.</div>
                        <div className="text-chatic-text-400 text-xs font-medium underline text-right mt-1">
                            인증코드 다시 받기
                        </div>
                        <div className="text-destructive text-xs font-medium underline text-right mt-1">
                            인증코드 다시 받기
                        </div>
                    </div>
                </div>

                <div className="flex justify-center mt-9">
                    <ChatButton disabled>확인</ChatButton>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <ChatButton>확인</ChatButton>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>이메일 등록을 하시겠습니까?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    일부 대화내용 및 에이전트 정보가 <br />
                                    저장되어, 나중에 확인이 가능합니다.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>취소</AlertDialogCancel>
                                <AlertDialogAction>완료</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>
        </div>
    );
};
