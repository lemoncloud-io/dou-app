import { ChevronLeft, ChevronRight } from 'lucide-react';

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
} from '@lemon/ui-kit';

export const MyPage = () => {
    return (
        <div className="flex flex-col min-h-screen bg-background">
            <header className="fixed top-0 w-full h-[52px] bg-white flex items-center py-3 px-4">
                <button>
                    <ChevronLeft size={24} strokeWidth={1.6} />
                </button>
                <div className="font-medium flex-1 flex justify-center mr-6">설정</div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 flex flex-col">
                <div className="flex flex-col space-y-[2px] flex-1">
                    <button className="flex items-center justify-between gap-1 font-medium py-3">
                        프로필 설정
                        <ChevronRight size={16} />
                    </button>
                    <button className="flex items-center justify-between gap-1 font-medium py-3">
                        나의 에이전트 설정
                        <ChevronRight size={16} />
                    </button>
                    <button className="flex items-center justify-between gap-1 font-medium py-3">
                        이메일 등록
                        <ChevronRight size={16} />
                    </button>
                    <div className="text-[13px] text-chatic-text-600 !mt-[9px] font-medium">채팅관리</div>
                    <button className="flex items-center justify-between gap-1 font-medium py-3">
                        나와의 채팅방 설정
                        <ChevronRight size={16} />
                    </button>
                </div>
                <AlertDialog>
                    <AlertDialogTrigger className="mt-auto underline text-sm text-chatic-text-700 font-medium mb-[18px]">
                        로그아웃
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>로그아웃 하시겠습니까?</AlertDialogTitle>
                            <AlertDialogDescription></AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction>로그아웃</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
};
