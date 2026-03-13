import { Bell, ChevronLeft, Crown, Lock, LogOut, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useDynamicProfile } from '@chatic/web-core';

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
    const { t } = useTranslation();
    const { channelId } = useParams<{ channelId: string }>();
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
    const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
    const { channel, isLoading, isError } = useMyChannel(channelId ?? null);
    const { leaveRoom, isPending: isLeavePending } = useLeaveRoom();
    const { deleteChannel, isPending: isDeletePending } = useDeleteChannel();
    const { toast } = useToast();

    const profile = useDynamicProfile();
    const { clearMessages } = useChatMessages(profile?.uid ?? null, channelId ?? null);

    const isOwner = channel?.ownerId === profile?.uid;
    const inviteCode = 'ABC123'; // TODO: Get from channel data

    const handleLeaveRoomClick = () => {
        if (confirm(t('chat.settings.leaveConfirm'))) {
            handleLeaveRoom();
        }
    };

    const handleDeleteRoomClick = () => {
        if (isDeletePending) return;
        if (confirm(t('chat.settings.deleteConfirm'))) {
            handleDeleteRoom();
        }
    };

    const handleLeaveRoom = async () => {
        if (!channelId) return;

        try {
            await leaveRoom(channelId, profile?.uid);
            await clearMessages();
            toast({ title: t('chat.settings.leftRoom') });
            navigate('/');
        } catch (error) {
            console.error('Failed to leave room:', error);
            toast({ title: t('chat.settings.leaveFailed'), variant: 'destructive' });
        }
    };

    const handleDeleteRoom = async () => {
        if (!channelId) return;

        try {
            await deleteChannel(channelId);
            toast({ title: t('chat.settings.deletedRoom') });
            navigate('/', { replace: true });
        } catch (error) {
            console.error('Failed to delete room:', error);
            toast({ title: t('chat.settings.deleteFailed'), variant: 'destructive' });
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="text-center">
                    <div className="text-sm text-muted-foreground">{t('chat.settings.loading')}</div>
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="text-center">
                    <div className="text-sm text-destructive">{t('chat.settings.error')}</div>
                    <button onClick={() => navigate(-1)} className="mt-2 text-sm text-primary underline">
                        {t('chat.settings.goBack')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-border px-4 py-4">
                <button onClick={() => navigate(-1)} className="p-1">
                    <ChevronLeft size={24} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">{t('chat.settings.title')}</h1>
                <div className="w-8" />
            </header>

            <div className="space-y-6 px-5 pt-6">
                {/* Room Info */}
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-2xl">💬</div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-foreground">
                                {channel?.name || t('chat.settings.roomName')}
                            </h2>
                            {isOwner && (
                                <button
                                    onClick={() => setIsUpdateDialogOpen(true)}
                                    className="text-xs font-medium text-primary"
                                >
                                    {t('chat.settings.edit')}
                                </button>
                            )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                            <Lock size={12} className="text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                                {channel?.stereo === 'public' ? t('chat.settings.public') : t('chat.settings.private')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Invite Code */}
                <InviteCodeCard code={inviteCode} label={t('chat.settings.inviteCode')} />

                {/* Actions */}
                <div className="space-y-0">
                    <button
                        onClick={() => setIsInviteDialogOpen(true)}
                        className="flex w-full items-center gap-3.5 rounded-lg px-1 py-4 transition-colors active:bg-muted"
                    >
                        <UserPlus size={20} className="text-muted-foreground" />
                        <span className="text-[15px] text-foreground">{t('chat.settings.inviteFriends')}</span>
                    </button>
                    <button className="flex w-full items-center gap-3.5 rounded-lg px-1 py-4 transition-colors active:bg-muted">
                        <Bell size={20} className="text-muted-foreground" />
                        <span className="text-[15px] text-foreground">{t('chat.settings.notifications')}</span>
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
                            <span className="text-[15px] text-destructive">{t('chat.settings.deleteRoom')}</span>
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
                            <span className="text-[15px] text-destructive">{t('chat.settings.leaveRoom')}</span>
                        </button>
                    )}
                </div>

                <div className="h-px bg-border" />

                {/* Members */}
                <div>
                    <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                        {t('chat.settings.roomMembers')}{' '}
                        <span className="text-muted-foreground">{channel?.memberNo ?? mockMembers.length}</span>
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
                                        <Crown size={12} /> {t('chat.settings.host')}
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
