import { ChevronLeft, ChevronRight } from 'lucide-react';

export const MyChatListPage = () => {
    return (
        <div className="flex flex-col min-h-screen bg-background">
            <header className="fixed top-0 w-full h-[52px] bg-white flex items-center py-3 px-4">
                <button>
                    <ChevronLeft size={24} strokeWidth={1.6} />
                </button>
                <div className="font-medium flex-1 flex justify-center mr-6">채팅방 설정</div>
            </header>

            <div className="flex-1 overflow-y-auto px-4">
                <div className="flex flex-col space-y-[2px]">
                    <button className="flex items-center justify-between gap-1 font-medium py-3">
                        채팅방 정보
                        <ChevronRight size={16} />
                    </button>
                    <button className="flex items-center justify-between gap-1 font-medium py-3">
                        나의 에이전트
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};
