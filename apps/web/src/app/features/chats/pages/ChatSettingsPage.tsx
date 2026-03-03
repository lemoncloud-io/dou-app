import { ChevronLeft, LogOut, MessageCircle, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { InviteFriendsDialog } from '../components/InviteFriendsDialog';
import { UpdateChannelDialog } from '../components/UpdateChannelDialog';
import { useMyChannel } from '../hooks/useMyChannel';
import { useLeaveRoom } from '../hooks/useLeaveRoom';
import { useSimpleWebCore } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
// import { useUsersInChannel } from '@chatic/channels';

export const ChatSettingsPage = () => {
    const navigate = useNavigate();
    const { channelId } = useParams<{ channelId: string }>();
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
    const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
    const { channel, isLoading, isError } = useMyChannel(channelId ?? null);
    const { leaveRoom } = useLeaveRoom();
    const { toast } = useToast();

    const { profile } = useSimpleWebCore();

    const isOwner = channel?.ownerId === profile?.id;

    const handleLeaveRoomClick = () => {
        if (confirm('정말로 채팅방을 나가시겠습니까?')) {
            handleLeaveRoom();
        }
    };

    const handleDeleteRoomClick = () => {
        handleDeleteRoom();
    };

    const handleLeaveRoom = async () => {
        if (!channelId) return;

        try {
            await leaveRoom(channelId, profile?.id);
            toast({ title: '채팅방을 나갔습니다' });
            navigate('/home');
        } catch (error) {
            console.error('Failed to leave room:', error);
            toast({ title: '방 나가기에 실패했습니다', variant: 'destructive' });
        }
    };

    const handleDeleteRoom = () => {
        toast({ title: '방 삭제 기능은 아직 지원되지 않습니다' });
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-white">
                <div className="text-center">
                    <div className="text-sm text-gray-500">채널 정보를 불러오는 중...</div>
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex h-screen items-center justify-center bg-white">
                <div className="text-center">
                    <div className="text-sm text-red-500">채널 정보를 불러올 수 없습니다</div>
                    <button onClick={() => navigate(-1)} className="mt-2 text-sm text-blue-500 underline">
                        뒤로 가기
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col bg-white">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-1.5 py-3 bg-white">
                <button onClick={() => navigate(-1)} className="w-11 h-11 flex items-center justify-center">
                    <ChevronLeft className="w-6 h-6 text-[#3A3C40]" />
                </button>
                <h1 className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-[#171725]">방 설정</h1>
                <div className="w-11 h-11" />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto flex flex-col gap-[25px] py-[10px]">
                {/* Room Info */}
                <div className="flex flex-col items-center gap-[19px]">
                    {/* Profile */}
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-14 h-14 rounded-full bg-[#F4F5F5] border border-[#F4F5F5] flex items-center justify-center">
                            <MessageCircle className="text-[#84888F]" />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1">
                                <span className="text-[17px] font-semibold leading-[1.294] tracking-[-0.02em] text-[#3A3C40]">
                                    {channel?.name || '방 이름'}
                                </span>
                            </div>
                            {isOwner && (
                                <button
                                    onClick={() => setIsUpdateDialogOpen(true)}
                                    className="text-[13px] font-medium text-[#2A7EF4]"
                                >
                                    편집
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Menu */}
                    <div className="flex gap-6">
                        <button onClick={() => setIsInviteDialogOpen(true)} className="flex flex-col items-center">
                            <div className="w-[46px] h-[46px]  flex items-center justify-center">
                                <UserPlus className="w-5 h-5 text-black" />
                            </div>
                            <span className="text-[14px] font-medium text-[#84888F] mt-1">친구 초대</span>
                        </button>
                        {/* <div className="flex flex-col items-center">
                            <div className="w-[46px] h-[46px] flex items-center justify-center">
                                <Bell className="w-5 h-5 text-[#84888F]" />
                            </div>
                            <span className="text-[14px] font-medium text-[#84888F] mt-1">알림</span>
                        </div> */}
                        {isOwner ? (
                            <button onClick={handleDeleteRoomClick} className="flex flex-col items-center">
                                <div className="w-[46px] h-[46px] flex items-center justify-center">
                                    <Trash2 className="w-5 h-5 text-[#FF4C35]" />
                                </div>
                                <span className="text-[14px] font-medium text-[#84888F] mt-1">방 삭제</span>
                            </button>
                        ) : (
                            <button onClick={handleLeaveRoomClick} className="flex flex-col items-center">
                                <div className="w-[46px] h-[46px] flex items-center justify-center">
                                    <LogOut className="w-5 h-5 text-black" />
                                </div>
                                <span className="text-[14px] font-medium text-[#84888F] mt-1">방 나가기</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Room Friends */}
                <div className="flex flex-col gap-[18px]">
                    {/* <div className="flex items-center gap-1 px-[18px]">
                        <span className="text-[16px] font-semibold leading-[1.5] tracking-[-0.02em] text-[#3A3C40]">
                            방 친구
                        </span>
                        <span className="text-[16px] font-semibold leading-[1.5] text-[#84888F]">100</span>
                    </div> */}

                    {/* Friends List */}
                    <div className="flex flex-col gap-3 px-4">
                        {/* My Profile */}
                        {/* <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-[#F4F5F5] border border-[#F4F5F5]" />
                            <div className="flex-1 flex flex-col justify-center gap-0.5">
                                <div className="flex items-center gap-1">
                                    <span className="text-[16px] font-medium leading-[1.375] tracking-[0.005em] text-[#222325]">
                                        써니 써니
                                    </span>
                                    <div className="px-[5px] py-[3px] bg-[#102346] rounded-[3px]">
                                        <span className="text-[11px] font-medium text-white">MY</span>
                                    </div>
                                </div>
                            </div>
                        </div> */}

                        {/* Friend Items */}
                        {/* {[1, 2, 3, 4, 5, 6, 7].map(i => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded-full bg-[#F4F5F5] border border-[#F4F5F5]" />
                                <div className="flex-1 flex items-center justify-between">
                                    <span className="text-[16px] font-medium leading-[1.375] tracking-[0.005em] text-[#222325]">
                                        {i === 1 ? '레모닝' : '&lt;친구 이름&gt;'}
                                    </span>
                                </div>
                            </div>
                        ))} */}
                    </div>
                </div>
            </div>

            <InviteFriendsDialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen} channelId={channelId} />
            <UpdateChannelDialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen} channelId={channelId} />
        </div>
    );
};
