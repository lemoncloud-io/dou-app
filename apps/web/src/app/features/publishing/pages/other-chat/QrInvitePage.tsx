import React, { useState } from 'react';

import { EllipsisVertical, Menu, Share2 } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@lemon/ui-kit';

export const QrInvitePage = () => {
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

            <div className="h-screen w-full pt-[52px] px-4 flex flex-col items-center justify-center">
                <div className="flex flex-col items-center space-y-[14px]">
                    {/* qr */}
                    <div className="bg-chatic-primary text-white rounded-full px-[14px] h-[33px] inline-flex items-center justify-center text-sm">
                        대화할 친구를 초대해주세요.
                    </div>
                    <div className="w-[138px] h-[138px] rounded-xl border border-chatic-100 flex items-center justify-center"></div>
                    <Sheet>
                        <SheetTrigger asChild>
                            <button className="shadow-chatic rounded-[27px] border border-chatic-100 py-2 pl-[15px] pr-4">
                                <Share2 className="w-5 h-5" />
                            </button>
                        </SheetTrigger>
                        <SheetContent side="bottom" className="px-4 rounded-t-xl py-0 max-h-[40vh] h-full">
                            <SheetHeader className="sticky top-0 z-5 bg-white flex-row items-center justify-between py-4 space-y-0">
                                <SheetTitle className="text-base font-medium">공유하기</SheetTitle>
                            </SheetHeader>
                            <div className="flex flex-col h-full overflow-auto scrollbar-hide">...</div>
                        </SheetContent>
                    </Sheet>
                </div>
                <div className="mt-10"></div>
                {/* 공유하기 or tag */}
                <div className="w-full rounded-lg overflow-hidden">
                    <div
                        className="w-full h-[122px] bg-black text-white text-[28px] flex items-center justify-center"
                        style={{ fontFamily: 'Aldrich', letterSpacing: '-1.68px' }}
                    >
                        Chatic
                    </div>
                    <div className="p-2 text-sm">
                        <div className="font-medium text-chatic-primary">chatic</div>
                        <p className="text-chatic-700">
                            sunny님이 chatic 친구 초대 링크를 보냈어요.! 초대 승락 후 채팅을 시작해 보세요.
                        </p>
                        <button className="mt-[10px] w-full h-9 bg-chatic-100 rounded-lg flex items-center justify-center font-medium">
                            확인
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
