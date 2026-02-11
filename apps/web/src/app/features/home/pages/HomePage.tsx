import { ChevronDown, LogOut } from 'lucide-react';

import { useChannels } from '@chatic/channels';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useSimpleWebCore } from '@chatic/web-core';

export const HomePage = () => {
    const { profile, logout } = useSimpleWebCore();
    const { data: channels } = useChannels({});

    const handleLogout = () => {
        logout();
        window.location.href = '/auth/login';
    };

    // console.log('channels:', channels);

    return (
        <div className="flex h-screen flex-col bg-white">
            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                {/* Profile Section */}
                <div className="flex flex-col items-center gap-0.5 px-[18px] py-4">
                    <div className="flex items-center gap-0.5">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="flex items-center gap-1.5 rounded-[27px] border border-[#B0EA10] bg-white px-2 py-1.5">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F4F5F5]">
                                        <div className="h-4 w-4 text-[#CFD0D3]">👤</div>
                                    </div>
                                    <span className="text-[15px] font-medium text-[#3A3C40]">
                                        {profile?.name || '사용자'}
                                    </span>
                                    <ChevronDown className="h-5.5 w-5.5 text-black" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" className="w-48">
                                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>로그아웃</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <span className="text-[13px] font-medium text-[#9FA2A7]">{profile?.email || ''}</span>
                </div>

                {/* Place Section */}
                <div className="flex flex-col gap-4 px-[18px]">
                    <h2 className="text-[16px] font-semibold leading-[1.33] tracking-[-0.023em] text-black">
                        내 플레이스
                    </h2>
                    <div className="px-4">
                        <button className="flex flex-col items-center justify-center gap-1 rounded-[14px] bg-[#F4F5F5] p-4">
                            <div className="h-[52px] w-[52px] rounded-full bg-[#EAEAEC]" />
                            <span className="text-[11px] font-medium leading-[1.4] text-[#53555B]">플레이스 추가</span>
                        </button>
                    </div>
                </div>

                {/* Divider */}
                <div className="my-3 px-4">
                    <div className="h-[3px] w-full bg-[#F4F5F5]" />
                </div>

                {/* Chat Section */}
                <div className="flex flex-col">
                    <div className="flex items-center justify-between px-[18px] py-3">
                        <h2 className="text-[18px] font-semibold leading-[1.33] tracking-[-0.023em] text-black">
                            Chat
                        </h2>
                        <div className="h-6 w-6">💬</div>
                    </div>

                    {/* Chat List */}
                    <div className="flex flex-col gap-[15px] px-5 py-3">
                        {/* Self Chat Item */}
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-[39px] w-[39px] items-center justify-center rounded-full bg-[#F4F5F5]">
                                <div className="h-4 w-4 text-[#CFD0D3]">👤</div>
                            </div>
                            <div className="flex flex-1 items-center">
                                <div className="flex flex-1 flex-col">
                                    <div className="flex items-center gap-1">
                                        <div className="rounded-[3px] bg-[#102346] px-1.5 py-0.5">
                                            <span className="text-[10px] font-normal leading-[1.5] text-white">MY</span>
                                        </div>
                                        <span className="text-[14px] font-semibold leading-[1.57] tracking-[0.005em] text-[#171725]">
                                            self chat
                                        </span>
                                    </div>
                                    <span className="text-[12px] font-normal leading-[1.67] tracking-[0.005em] text-[#9FA2A7]">
                                        나와의 채팅을 시작해 보세요
                                    </span>
                                </div>
                                <div className="flex h-[45px] flex-col items-end gap-1">
                                    <span className="w-[67px] text-right text-[10px] font-normal leading-[2] tracking-[0.005em] text-[#9CA4AB]">
                                        오전 11:30
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
