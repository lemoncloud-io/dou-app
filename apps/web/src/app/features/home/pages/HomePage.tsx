import { ChevronDown, CirclePlus, User } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { publicChannelsKeys } from '@chatic/channels';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useSimpleWebCore } from '@chatic/web-core';

import { SettingsDialog } from '../../../components/SettingsDialog';
import { ChannelList } from '../components/ChannelList';
import { CreateChannelDialog } from '../components/CreateChannelDialog';

export const HomePage = () => {
    const { profile, logout } = useSimpleWebCore();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const handleLogout = () => {
        logout();
        window.location.href = '/auth/login';
    };

    const queryClient = useQueryClient();

    const handleComplete = () => {
        queryClient.invalidateQueries({ queryKey: publicChannelsKeys.list({ limit: -1 }) });
    };

    return (
        <div className="flex h-screen flex-col bg-white">
            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                {/* Profile Section */}
                <div className="flex gap-0.5 pt-6 pb-8 px-4">
                    <div className="flex flex-1 items-center gap-0.5 ">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="flex items-center gap-2">
                                    <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[rgba(0,43,126,0.04)] border border-[#F4F5F5]">
                                        <User className="h-4 w-4 text-[rgba(0,15,44,0.49)]" />
                                    </div>
                                    <div className="flex flex-col justify-center">
                                        <div className="flex items-center gap-1">
                                            <span className="text-[17px] font-semibold leading-[1.19] tracking-[-0.025em] text-[#3A3C40]">
                                                {profile?.name || '-'}
                                            </span>
                                            <ChevronDown className="h-[18px] w-[18px] text-black" />
                                        </div>
                                        <span className="text-[13px] font-normal leading-[1.19] tracking-[-0.01em] text-[#9FA2A7]">
                                            {profile?.email || '-'}
                                        </span>
                                    </div>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuItem onClick={() => setIsSettingsOpen(true)} className="cursor-pointer">
                                    <span>설정</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                                    <span>로그아웃</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    {/* <button>
                        <Search />
                    </button> */}
                </div>

                {/* Place Section */}
                {/* <div className="flex flex-col gap-4 px-[18px]">
                    <h2 className="text-[16px] font-semibold leading-[1.33] tracking-[-0.023em] text-black">
                        내 플레이스
                    </h2>
                    <div className="flex gap-5 overflow-x-auto py-2">
                        <button
                            onClick={() => setIsPlaceDialogOpen(true)}
                            className="flex flex-col items-center justify-center gap-[5px] rounded-[14px]  flex-shrink-0"
                        >
                            <div className="h-14 w-14 rounded-full border border-[#EAEAEC] flex items-center justify-center">
                                <Plus className="h-6 w-6 text-[#84888F]" />
                            </div>
                            <span className="text-[14px] font-normal leading-[1.19] tracking-[-0.018em] text-[#9FA2A7]">
                                플레이스 추가
                            </span>
                        </button>

                        {[
                            { id: 1, name: 'Place Name', selected: true, hasNotification: true },
                            { id: 2, name: 'Place Name', selected: false, hasNotification: true },
                            { id: 3, name: 'Place Name', selected: false, hasNotification: false },
                        ].map(place => (
                            <button
                                key={place.id}
                                className="flex flex-col items-center justify-center gap-[5px] rounded-[14px]  flex-shrink-0 relative"
                            >
                                <div className="relative">
                                    <div className="h-14 w-14 rounded-full bg-[#102346] flex items-center justify-center">
                                        <div className="text-white text-2xl">🏠</div>
                                    </div>
                                    {place.selected && (
                                        <div className="absolute bottom-0 right-0 w-[14px] h-[14px] bg-white rounded-full flex items-center justify-center">
                                            <div className="w-2 h-2 bg-[#C139E3] rounded-full" />
                                        </div>
                                    )}
                                    {place.hasNotification && (
                                        <div className="absolute top-0 right-0 w-[7px] h-[7px] bg-[#FF4C35] rounded-full border-[1.5px] border-white" />
                                    )}
                                </div>
                                <span
                                    className={`text-[14px] font-normal leading-[1.19] tracking-[-0.018em] ${
                                        place.selected ? 'text-black' : 'text-[#9FA2A7]'
                                    }`}
                                >
                                    {place.name}
                                </span>
                            </button>
                        ))}
                    </div>
                </div> */}

                {/* Divider */}
                {/* <div className="my-3 px-4">
                    <div className="h-[3px] w-full bg-[#F4F5F5]" />
                </div> */}

                {/* Chat Section */}
                <div className="flex flex-col">
                    <div className="flex items-center justify-between px-[18px] py-3">
                        <h2 className="text-[18px] font-semibold leading-[1.33] tracking-[-0.023em] text-black">
                            Chat
                        </h2>
                        <button onClick={() => setIsDialogOpen(true)} className="h-6 w-6 text-black">
                            <CirclePlus className="h-6 w-6" />
                        </button>
                    </div>

                    {/* Chat List */}
                    <div className="flex flex-col gap-[15px] px-5 py-3">
                        <ChannelList />
                    </div>
                </div>
            </div>

            <CreateChannelDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} onComplete={handleComplete} />
            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
        </div>
    );
};
