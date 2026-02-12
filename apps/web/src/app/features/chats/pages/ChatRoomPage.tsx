import { ChevronLeft, Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useSendPublicMessage } from '@chatic/chats';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

export const ChatRoomPage = () => {
    const navigate = useNavigate();
    const { channelId } = useParams<{ channelId: string }>();
    const [content, setContent] = useState('');
    const [isComposing, setIsComposing] = useState(false);
    const { mutateAsync: sendMessage, isPending } = useSendPublicMessage();

    const handleSend = async () => {
        if (!content.trim() || !channelId || isPending) return;

        try {
            await sendMessage({
                channelId,
                content: content.trim(),
            });
            setContent('');
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
            e.preventDefault();
            console.log('simmy twice');
            handleSend();
        }
    };

    return (
        <div className="flex h-screen flex-col bg-white">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-1.5 py-3 bg-white">
                <button onClick={() => navigate(-1)} className="w-11 h-11 flex items-center justify-center">
                    <ChevronLeft className="w-6 h-6 text-[#3A3C40]" />
                </button>
                <h1 className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-[#171725]">채팅방</h1>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="w-11 h-11 flex items-center justify-center">
                            <Ellipsis className="w-6 h-6 text-[#3A3C40]" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                            onClick={() => navigate(`/chats/${channelId}/settings`)}
                            className="cursor-pointer"
                        >
                            <span>설정</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Participants */}
            <div className="flex items-center gap-1 px-[18px] py-3">
                <div className="flex items-center gap-[-6px]">{/* Placeholder for participant avatars */}</div>
                <span className="text-[14px] font-medium leading-[1.857] tracking-[0.005em] text-[#84888F]">+22</span>
            </div>

            {/* Date Separator */}
            <div className="flex items-center justify-center gap-2.5 px-4 py-2">
                <div className="flex items-center justify-center gap-2.5 px-2 py-1 bg-[#F4F5F5] rounded-[7px]">
                    <span className="text-[11px] font-medium text-[#84888F]">2025년 00월 00일 월요일</span>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto px-[18px] py-3 flex flex-col gap-3.5">
                {/* My Message */}
                <div className="flex flex-col items-end gap-1.25">
                    <div className="flex items-end gap-1.25">
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-[11px] font-normal leading-[1.4] tracking-[0.005em] text-[#9CA4AB]">
                                오전 11:30
                            </span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-3 bg-[#102346] rounded-[14px_14px_0px_14px] max-w-[269px]">
                            <span className="text-[14px] font-normal leading-[1.3] text-white">
                                Lorem ipsum dolor sit amet consectetur. Nulla orci imperdiet.
                            </span>
                        </div>
                    </div>
                </div>

                {/* Other's Message */}
                <div className="flex flex-col gap-2 px-[18px]">
                    <div className="flex flex-col gap-1.25">
                        <div className="flex gap-1.25">
                            <div className="flex h-[39px] w-[39px] items-center justify-center rounded-full bg-[#F4F5F5]" />
                            <div className="flex items-center gap-2 px-6 py-3 bg-[#F6F6F6] rounded-[0px_14px_14px_14px]">
                                <span className="text-[14px] font-normal leading-[1.3] text-[#171725]">
                                    Lorem ipsum dolor sit amet
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-normal leading-[1.4] tracking-[0.005em] text-[#9CA4AB]">
                                오전 11:52
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Input Area */}
            <div className="flex flex-col gap-2.5 px-4 py-3">
                <div className="flex items-center gap-1.5 px-1.5 py-1.5 bg-[#F4F5F5] rounded-2xl">
                    <button
                        onClick={handleSend}
                        disabled={isPending || !content.trim()}
                        className="flex items-center justify-center gap-2.5 w-10 h-10 bg-[#CFD0D3] rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                                <path
                                    d="M13 1L6.5 7.5M13 1L9 13L6.5 7.5M13 1L1 5L6.5 7.5"
                                    stroke="white"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        )}
                    </button>
                    <div className="flex-1 flex items-center gap-1.5 px-1.5">
                        <input
                            type="text"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            onKeyDown={handleKeyPress}
                            onCompositionStart={() => setIsComposing(true)}
                            onCompositionEnd={() => setIsComposing(false)}
                            disabled={isPending}
                            placeholder="메시지를 입력해 주세요"
                            className="flex-1 bg-transparent border-0 outline-none text-[14px] font-normal leading-[1.45] tracking-[-0.02em] text-[#9CA4AB] placeholder:text-[#9CA4AB] disabled:opacity-50"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
