import { useState } from 'react';

import { Search, User, X } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@lemon/ui-kit/components/ui/avatar';

export const SearchPage = () => {
    const [value, setValue] = useState('');

    return (
        <div className="min-h-screen bg-white px-4">
            <div className="flex items-center gap-3 py-3">
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
                <button type="button" className="text-sm font-medium whitespace-nowrap">
                    취소
                </button>
            </div>

            {/* 최근 검색 */}
            <div className="flex items-center justify-between mt-3">
                <div className="text-base font-semibold text-chatic-text-800">최근 검색</div>
                <button type="button" className="text-sm text-chatic-text-600" aria-label="최근 검색 전체 삭제">
                    전체 삭제
                </button>
            </div>

            {/* 검색 태그 리스트 */}
            <div
                className="mx-[-16px] overflow-auto px-4 flex items-center mt-[9px] gap-[6px]"
                aria-label="최근 검색어 목록"
            >
                {['text1', 'text2', 'text3'].map((text, idx) => (
                    <div
                        key={idx}
                        className="bg-chatic-100 rounded-full h-6 flex items-center justify-center gap-[2px] pl-2 pr-[6px]"
                    >
                        <span className="text-xs text-chatic-text-primary">{text}</span>
                        <button type="button" aria-label={`${text} 삭제`} className="p-[2px] rounded">
                            <X size={10} aria-hidden />
                        </button>
                    </div>
                ))}
            </div>

            {/* 검색 내역 없을때 */}
            <div className="text-center text-sm text-chatic-text-600 my-3">최근 검색 내역이 없습니다.</div>

            {/* 검색 결과 */}
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

                            <div className="flex justify-between">
                                <div className="text-xs text-chatic-text-700">
                                    <span className="text-chatic-text-accent font-bold">마</span>지막 채팅 내용으로 노출
                                </div>
                            </div>
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
                            <div className="text-sm font-medium flex items-center gap-2">
                                <span className="truncate w-full block text-chatic-text-800">
                                    SunnySunnySunnySunnySunnySunnySunnySunnySunnySunny
                                </span>
                                <div className="text-chatic-text-600 text-sm font-medium shrink-0">3</div>
                                <div className="shrink-0 text-[11px] font-medium text-chatic-text-600">오전 11:30</div>
                            </div>

                            <div className="flex justify-between">
                                <div className="text-xs text-chatic-text-700">
                                    <span className="text-chatic-text-accent font-bold">마</span>지막 채팅 내용으로 노출
                                </div>
                                <div className="bg-chatic-primary rounded-full min-w-[15px] min-h-[15px] px-1 flex items-center justify-center text-white text-[11px] font-medium">
                                    1
                                </div>
                            </div>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    );
};
