import React, { useState } from 'react';

import { EllipsisVertical, Menu, User } from 'lucide-react';

import { Images } from '@lemon/assets';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Avatar,
    AvatarFallback,
    AvatarImage,
    ChatInput,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@lemon/ui-kit';


export const OtherChatPage = () => {
    const chatInputRef = React.useRef<HTMLTextAreaElement>(null);
    const [isAlertOpen, setIsAlertOpen] = useState(false);

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <header className="fixed top-0 w-full bg-white flex items-center justify-between gap-2 py-3 px-4">
                <button>
                    <Menu size={24} />
                </button>
                <div className="text-base font-medium truncate">설정한 채팅방 이름으로</div>
                <DropdownMenu>
                    <DropdownMenuTrigger className="focus:outline-0 w-6 h-6 rounded p-[2px] flex items-center justify-center data-[state=open]:bg-chatic-100">
                        <EllipsisVertical />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="p-[6px]">
                        <DropdownMenuItem className="p-1 text-xs text-chatic-text-800">채팅방 설정</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="p-1 text-xs text-chatic-text-800">
                            대화상대 보기 및 초대
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="p-1 text-xs text-destructive">채팅방 나가기</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>

            <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            나와의 채팅방을
                            <br />
                            숨김 처리 하시겠습니까?
                        </AlertDialogTitle>
                        <AlertDialogDescription>설정에서 숨김 해제가 가능합니다.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction>확인</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="flex-1 overflow-y-auto px-4 pb-32 pt-[52px]">
                {/* 내 입력 */}
                <div className="w-full flex items-end justify-end gap-[6px] py-[6px]">
                    <div className="text-[11px] text-chatic-text-600">오전 10:39</div>
                    <div className="max-w-[70%] py-[6px] px-3 rounded-xl bg-chatic-primary text-white text-sm">
                        강릉 여행 1박 2일 코스 정해줘!
                    </div>
                </div>

                {/* 내 ai 답변 */}
                <div className="pt-[6px]">
                    <div className="flex items-center justify-end gap-[6px]">
                        <div className="text-xs flex items-center gap-[2px]">
                            <div className="text-xs text-[#C139E3] font-medium">AI</div>
                            <span className="text-[#DFE0E2]">•</span>
                            <div>나의 에이전트</div>
                        </div>
                        <div className="w-6 h-6 flex items-center justify-center border-[0.5px] border-[#A62DF2] rounded-full">
                            <img src={Images.chatbot} alt="" />
                        </div>
                    </div>
                    <div className="w-full flex items-end justify-end gap-[6px] py-[6px]">
                        <div className="text-[11px] text-chatic-text-600">오전 10:39</div>
                        <div className="max-w-[70%] py-[6px] px-3 rounded-xl bg-chatic-primary text-white text-sm">
                            20~30대 사이에서 유명한 핫플 위주로 알려드릴게요.🥳 ✔️ 식사 : 동화가든(순두부 짬뽕) ✔️ 카페
                            : 시만차(초당옥수수 빙수가 유명해요.🌽) ✔️ 볼거리 : 사근진 해변(알록달록 방파제가 이뻐요.!)
                            ✔️ 숙소 : 스카이베이(멋진 건물과 탁 트인 오션뷰가 멋진 곳)
                        </div>
                    </div>
                </div>

                {/* 다른 사용자 입력 */}
                <div className="pt-[6px]">
                    <div className="flex items-center  gap-[6px]">
                        <Avatar className="w-6 h-6">
                            <AvatarImage src="" alt="사용자 프로필 이미지" />
                            <AvatarFallback>
                                <User className="w-[14px] h-[14px] text-chatic-text-500" aria-hidden />
                            </AvatarFallback>
                        </Avatar>
                        <div className="text-xs text-chatic-text-700">다른 사용자</div>
                    </div>
                    <div className="w-full flex items-end gap-[6px] py-[6px]">
                        <div className="max-w-[70%] py-[6px] px-3 rounded-xl bg-chatic-50 text-sm">
                            강릉 여행 1박 2일 코스 정해줘!
                        </div>
                        <div className="text-[11px] text-chatic-text-600">오전 10:39</div>
                    </div>
                </div>

                {/* 다른 사용자 ai 답변 */}
                <div className="pt-[6px]">
                    <div className="flex items-center  gap-[6px]">
                        <div className="w-6 h-6 flex items-center justify-center border-[0.5px] border-[#A62DF2] rounded-full">
                            <img src={Images.chatbot} alt="" />
                        </div>
                        <div className="text-xs flex items-center gap-[2px]">
                            <div className="text-xs text-[#C139E3] font-medium">AI</div>
                            <span className="text-[#DFE0E2]">•</span>
                            <div className="text-chatic-text-700">다른 사용자 에이전트</div>
                        </div>
                    </div>
                    <div className="w-full flex items-end  gap-[6px] py-[6px]">
                        <div className="max-w-[70%] py-[6px] px-3 rounded-xl bg-chatic-50 text-sm">
                            20~30대 사이에서 유명한 핫플 위주로 알려드릴게요.🥳 ✔️ 식사 : 동화가든(순두부 짬뽕) ✔️ 카페
                            : 시만차(초당옥수수 빙수가 유명해요.🌽) ✔️ 볼거리 : 사근진 해변(알록달록 방파제가 이뻐요.!)
                            ✔️ 숙소 : 스카이베이(멋진 건물과 탁 트인 오션뷰가 멋진 곳)
                        </div>
                        <div className="text-[11px] text-chatic-text-600">오전 10:39</div>
                    </div>
                </div>

                <div className="text-sm text-center text-chatic-text-700">“...” 님이 채팅방을 나갔습니다.</div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-background">
                <ChatInput ref={chatInputRef} placeholder="메시지를 입력해 주세요." />
            </div>
        </div>
    );
};
