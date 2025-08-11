import { useState } from 'react';

import { ChevronRight, ChevronsLeft, Plus, Search, User, X } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@lemon/ui-kit/components/ui/avatar';
import { ChatButton } from '@lemon/ui-kit/components/ui/chat-button';

export const MenuPage = () => {
    const [value, setValue] = useState('');

    return (
        <div className="min-h-screen bg-white px-4">
            <div className="flex items-center gap-2 py-3">
                <button type="button">
                    <ChevronsLeft size={22} />
                </button>
                <div className="w-full h-[33px] p-2 flex items-center gap-2 bg-chatic-50 rounded-lg">
                    <Search size={16} />
                    <input
                        type="text"
                        className="w-full bg-chatic-50 outline-none text-sm"
                        placeholder="채팅방 이름 검색"
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
            </div>

            <div className="bg-white py-[10px] px-[11px] border-[0.5px] border-[#3968C3] rounded-[16px] flex items-center justify-between gap-2 my-[9px] shadow-chatic">
                <div className="w-1/2 flex items-center gap-[10px] overflow-auto]">
                    <Avatar className="w-[38px] h-[38px]">
                        <AvatarImage src="" alt="사용자 프로필 이미지" />
                        <AvatarFallback>
                            <User className="w-4 h-4 text-chatic-text-500" aria-hidden />
                        </AvatarFallback>
                    </Avatar>
                    <span className="truncate w-full block text-[15px] font-medium text-chatic-text-800">
                        SunnySunnySunnySunnySunnySunnySunnySunnySunnySunny
                    </span>
                </div>
                <div className="shrink-0 flex items-center gap-[3px]">
                    <div className="bg-chatic-50 p-[5px] rounded-md">
                        <div
                            className="font-medium text-[13px]"
                            style={{
                                WebkitTextFillColor: 'transparent',
                                backgroundImage:
                                    'linear-gradient(90deg, #3968C3 3.75%, #102F6B 46.88%, #2A63D1 94.37%)',
                                backgroundClip: 'text',
                            }}
                        >
                            3일 무료 혜택 이용중
                        </div>
                    </div>
                    <ChevronRight size={16} />
                </div>
            </div>

            <div className="text-base font-semibold mt-3 text-chatic-text-800">채팅</div>
            <ul className="flex flex-col space-y-1">
                <li className="flex justify-between gap-2 py-3">
                    <div className="flex items-center gap-[9px] w-full overflow-auto">
                        <Avatar>
                            <AvatarImage src="" alt="사용자 프로필 이미지" />
                            <AvatarFallback>
                                <User className="w-4 h-4 text-chatic-text-500" aria-hidden />
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col space-y-1 w-full overflow-auto">
                            <div className="text-sm font-medium flex items-center gap-2">
                                <span className="truncate w-full block text-chatic-text-800">
                                    SunnySunnySunnySunnySunnySunnySunnySunnySunnySunny
                                </span>
                                <div className="shrink-0 px-[5px] bg-chatic-primary text-white rounded-[18px] text-[11px]">
                                    내 채팅
                                </div>
                                <div className="shrink-0 text-[11px] font-medium text-chatic-text-600">오전 11:30</div>
                            </div>

                            <div className="text-xs text-chatic-text-700">마지막 채팅 내용으로 노출</div>
                        </div>
                    </div>
                </li>
                <li className="flex justify-between gap-2 py-3">
                    <div className="flex items-center gap-[9px] w-full overflow-auto">
                        <Avatar>
                            <AvatarImage src="" alt="사용자 프로필 이미지" />
                            <AvatarFallback>
                                <User className="w-4 h-4 text-chatic-text-500" aria-hidden />
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col space-y-1 w-full overflow-auto">
                            <div className="text-sm font-medium flex items-center gap-2">
                                <span className="truncate w-full block text-chatic-text-800">Sunny</span>
                                <div className="shrink-0 text-[11px] font-medium text-chatic-text-600">오전 11:30</div>
                            </div>

                            <div className="text-xs text-[#C139E3]">친구와 첫 대화를 시작해 보세요.!</div>
                        </div>
                    </div>
                </li>
                <li className="flex justify-between gap-2 py-3">
                    <div className="flex items-center gap-[9px] w-full overflow-auto">
                        <Avatar>
                            <AvatarImage src="" alt="사용자 프로필 이미지" />
                            <AvatarFallback>
                                <User className="w-4 h-4 text-chatic-text-500" />
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col space-y-1 w-full overflow-auto">
                            <div>
                                <div className="text-sm font-medium flex items-center gap-2">
                                    <span className="truncate w-full block text-chatic-text-800">
                                        SunnySunnySunnySunnySunnySunnySunnySunnySunnySunny
                                    </span>
                                    <div className="text-chatic-text-600 text-sm font-medium shrink-0">3</div>
                                    <div className="shrink-0 text-[11px] font-medium text-chatic-text-600">
                                        오전 11:30
                                    </div>
                                </div>

                                <div className="flex justify-between">
                                    <div className="text-xs text-chatic-text-700">마지막 채팅 내용으로 노출</div>
                                    <div className="flex items-center gap-[5px]">
                                        <div className="relative text-[11px] text-[#C139E3] font-medium bg-chatic-100 rounded-lg px-1">
                                            AI
                                            <span className="w-[3.5px] h-[3.5px] rounded-full bg-[#C139E3] absolute top-0 right-0"></span>
                                        </div>

                                        <div className="bg-chatic-primary rounded-full min-w-[15px] min-h-[15px] px-1 flex items-center justify-center text-white text-[11px] font-medium">
                                            +300
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </li>
            </ul>
            <div className="mt-[18px] text-sm font-medium flex flex-col items-center">
                <div className="inline-flex text-white bg-chatic-primary py-2 px-[14px] rounded-full">
                    무료 혜택 이용은 채팅방 3개까지 이용 가능해요.
                </div>
                <div className="mt-2 flex justify-center">
                    <button className="flex items-center gap-1 text-chatic-text-800">
                        혜택 업그레이드 하기 <ChevronRight size={16} />
                    </button>
                </div>
            </div>
            <div className="fixed bottom-4 right-4">
                <ChatButton className="flex gap-[6px]">
                    <Plus className="text-white w-5 h-5" />
                    채팅방 만들기
                </ChatButton>
            </div>
        </div>
    );
};
