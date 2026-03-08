import { Bell, ChevronLeft, Crown, Lock, LogOut, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useSimpleWebCore } from '@chatic/web-core';

import { InviteCodeCard } from '../../workspace/components/InviteCodeCard';
import { InviteFriendsDialog } from '../components/InviteFriendsDialog';
import { UpdateChannelDialog } from '../components/UpdateChannelDialog';
import { useChatMessages } from '../hooks/useChatMessages';
import { useDeleteChannel } from '../hooks/useDeleteChannel';
import { useLeaveRoom } from '../hooks/useLeaveRoom';
import { useMyChannel } from '../hooks/useMyChannel';

// Mock members for now - TODO: Replace with API data
const mockMembers = [
    { id: '1', name: 'sunny', avatar: null, role: 'host', isMe: true },
    {
        id: '2',
        name: '김민수',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face',
        role: 'member',
        isMe: false,
    },
    {
        id: '3',
        name: '이지은',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face',
        role: 'member',
        isMe: false,
    },
];

export const ChatSettingsPage = () => {
    const navigate = useNavigate();
    const { channelId } = useParams<{ channelId: string }>();
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
    const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
    const { channel, isLoading, isError } = useMyChannel(channelId ?? null);
    const { leaveRoom, isPending: isLeavePending } = useLeaveRoom();
    const { deleteChannel, isPending: isDeletePending } = useDeleteChannel();
    const { toast } = useToast();

    const { profile } = useSimpleWebCore();
    const { clearMessages } = useChatMessages(profile?.id ?? null, channelId ?? null);

    const isOwner = channel?.ownerId === profile?.id;
    const inviteCode = 'ABC123'; // TODO: Get from channel data

    const handleLeaveRoomClick = () => {
        if (confirm('정말로 채팅방을 나가시겠습니까?')) {
            handleLeaveRoom();
        }
    };

    const handleDeleteRoomClick = () => {
        if (isDeletePending) return;
        if (confirm('정말로 채팅방을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            handleDeleteRoom();
        }
    };

    const handleLeaveRoom = async () => {
        if (!channelId) return;

        try {
            await leaveRoom(channelId, profile?.id);
            await clearMessages();
            toast({ title: '채팅방을 나갔습니다' });
            navigate('/');
        } catch (error) {
            console.error('Failed to leave room:', error);
            toast({ title: '방 나가기에 실패했습니다', variant: 'destructive' });
        }
    };

    const handleDeleteRoom = async () => {
        if (!channelId) return;

        try {
            await deleteChannel(channelId);
            toast({ title: '채팅방이 삭제되었습니다' });
            navigate('/', { replace: true });
        } catch (error) {
            console.error('Failed to delete room:', error);
            toast({ title: '방 삭제에 실패했습니다', variant: 'destructive' });
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="text-center">
                    <div className="text-sm text-muted-foreground">채널 정보를 불러오는 중...</div>
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="text-center">
                    <div className="text-sm text-destructive">채널 정보를 불러올 수 없습니다</div>
                    <button onClick={() => navigate(-1)} className="mt-2 text-sm text-primary underline">
                        뒤로 가기
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-border px-4 pb-3 pt-3">
                <button onClick={() => navigate(-1)} className="p-1">
                    <ChevronLeft size={24} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">방 설정</h1>
                <div className="w-8" />
            </header>

            <div className="space-y-6 px-5 pt-6">
                {/* Room Info */}
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-2xl">💬</div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-foreground">{channel?.name || '방 이름'}</h2>
                            {isOwner && (
                                <button
                                    onClick={() => setIsUpdateDialogOpen(true)}
                                    className="text-xs font-medium text-primary"
                                >
                                    편집
                                </button>
                            )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                            <Lock size={12} className="text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                                {channel?.stereo === 'public' ? '공개' : '비공개'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Invite Code */}
                <InviteCodeCard code={inviteCode} label="채팅방 초대 코드" />

                {/* Actions */}
                <div className="space-y-0">
                    <button
                        onClick={() => setIsInviteDialogOpen(true)}
                        className="flex w-full items-center gap-3.5 rounded-lg px-1 py-4 transition-colors active:bg-muted"
                    >
                        <UserPlus size={20} className="text-muted-foreground" />
                        <span className="text-[15px] text-foreground">친구 초대</span>
                    </button>
                    <button className="flex w-full items-center gap-3.5 rounded-lg px-1 py-4 transition-colors active:bg-muted">
                        <Bell size={20} className="text-muted-foreground" />
                        <span className="text-[15px] text-foreground">알림</span>
                    </button>
                    {isOwner ? (
                        <button
                            onClick={handleDeleteRoomClick}
                            disabled={isDeletePending}
                            className="flex w-full items-center gap-3.5 rounded-lg px-1 py-4 transition-colors disabled:opacity-50 active:bg-muted"
                        >
                            {isDeletePending ? (
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                            ) : (
                                <Trash2 size={20} className="text-destructive" />
                            )}
                            <span className="text-[15px] text-destructive">방 삭제</span>
                        </button>
                    ) : (
                        <button
                            onClick={handleLeaveRoomClick}
                            disabled={isLeavePending}
                            className="flex w-full items-center gap-3.5 rounded-lg px-1 py-4 transition-colors disabled:opacity-50 active:bg-muted"
                        >
                            {isLeavePending ? (
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                            ) : (
                                <LogOut size={20} className="text-destructive" />
                            )}
                            <span className="text-[15px] text-destructive">방 나가기</span>
                        </button>
                    )}
                </div>

                <div className="h-px bg-border" />

                {/* Members */}
                <div>
                    <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                        방 친구 <span className="text-muted-foreground">{channel?.memberNo ?? mockMembers.length}</span>
                    </h3>
                    <div className="space-y-0">
                        {mockMembers.map(m => (
                            <div key={m.id} className="flex items-center gap-3 px-1 py-3">
                                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted">
                                    {m.avatar ? (
                                        <img src={m.avatar} alt={m.name} className="h-full w-full object-cover" />
                                    ) : (
                                        <span className="text-lg">👤</span>
                                    )}
                                </div>
                                <span className="flex-1 text-[15px] font-medium text-foreground">{m.name}</span>
                                {m.role === 'host' && (
                                    <span className="flex items-center gap-1 rounded-full bg-accent/20 px-2 py-1 text-xs text-accent-foreground">
                                        <Crown size={12} /> 호스트
                                    </span>
                                )}
                                {m.isMe && (
                                    <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                                        MY
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <InviteFriendsDialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen} channelId={channelId} />
            <UpdateChannelDialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen} channelId={channelId} />
        </div>
    );
};
