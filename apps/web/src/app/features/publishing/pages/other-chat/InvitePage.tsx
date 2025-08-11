import { ChevronLeft, Plus, User } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@lemon/ui-kit/components/ui/avatar';

export const InvitePage = () => {
    return (
        <div className="min-h-screen bg-white">
            <header className="fixed top-0 w-full h-[52px] bg-white flex items-center py-3 px-4">
                <button>
                    <ChevronLeft size={24} strokeWidth={1.6} />
                </button>
                <div className="font-medium flex-1 flex justify-center mr-6 truncate">대화상대 보기 및 초대</div>
            </header>
            <div className="pt-[52px] px-4">
                <ul className="flex flex-col space-y-[6px] mt-2">
                    <li className="flex justify-between gap-2 py-1">
                        <div className="flex items-center gap-[9px] w-full overflow-auto">
                            <Avatar>
                                <AvatarImage src="" alt="사용자 프로필 이미지" />
                                <AvatarFallback>
                                    <User className="w-4 h-4 text-chatic-text-500" aria-hidden />
                                </AvatarFallback>
                            </Avatar>
                            <span className="truncate text-[15px] font-medium">
                                SunnySunnySunnySunnySunnySunnySunnySunnySunnySunny
                            </span>
                            <div className="shrink-0 px-[5px] bg-chatic-primary text-white rounded-[18px] text-[11px] font-medium">
                                나
                            </div>
                        </div>
                    </li>
                    <li className="flex justify-between gap-2 py-1">
                        <div className="flex items-center gap-[9px] w-full overflow-auto">
                            <Avatar>
                                <AvatarImage src="" alt="사용자 프로필 이미지" />
                                <AvatarFallback>
                                    <User className="w-4 h-4 text-chatic-text-500" />
                                </AvatarFallback>
                            </Avatar>
                            <span className="truncate text-[15px] font-medium">친구 닉네임</span>
                        </div>
                    </li>
                    <li className="flex justify-between gap-2 py-1">
                        <button className="text-chatic-text-accent text-[15px] font-medium flex items-center gap-[9px]">
                            <div className="w-8 h-8 border-[0.5px] border-[#DFE0E2] rounded-full flex items-center justify-center">
                                <Plus className="w-4 h-4" />
                            </div>
                            친구 초대 링크 보내기
                        </button>
                    </li>
                </ul>
            </div>
        </div>
    );
};
