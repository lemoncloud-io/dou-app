import { Bell, ChevronLeft, LogOut, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useDynamicProfile } from '@chatic/web-core';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { InviteFriendsDialog } from '../components/InviteFriendsDialog';
import { MemberListItem } from '../components/MemberListItem';
import { UpdateChannelDialog } from '../components/UpdateChannelDialog';
import { useMyChannels } from '../../home/hooks';
import { useChannelMembers, useChatMessages, useDeleteChannel, useLeaveRoom, useMyChannel } from '../hooks';

import type { LucideIcon } from 'lucide-react';

type DialogType = 'invite' | 'update' | 'delete' | 'leave' | null;

interface ActionButtonProps {
    icon: LucideIcon;
    label: string;
    onClick?: () => void;
    variant?: 'default' | 'danger';
}

const ActionButton = ({ icon: Icon, label, onClick, variant = 'default' }: ActionButtonProps) => (
    <button onClick={onClick} className="flex flex-col items-center">
        <div className="flex size-[38px] items-center justify-center rounded-[23px] bg-muted p-[9px]">
            <Icon size={20} className={variant === 'danger' ? 'text-destructive' : 'text-muted-foreground'} />
        </div>
        <span className="text-[15px] font-medium leading-[1.3] text-muted-foreground">{label}</span>
    </button>
);

const ChatProfileIcon = () => (
    <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <svg width="32" height="32" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M28 8C16.954 8 8 16.954 8 28C8 32.944 9.712 37.486 12.586 41.04L10.5 46L16.5 44.5C20.054 46.988 24.328 48 28 48C39.046 48 48 39.046 48 28C48 16.954 39.046 8 28 8Z"
                className="stroke-foreground"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    </div>
);

export const ChatSettingsPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { channelId } = useParams<{ channelId: string }>();
    const [activeDialog, setActiveDialog] = useState<DialogType>(null);
    const { channel, isLoading, isError } = useMyChannel(channelId ?? null);
    const { members, total: membersTotal, isLoading: isMembersLoading } = useChannelMembers(channelId ?? null);
    const { leaveRoom, isPending: isLeavePending } = useLeaveRoom();
    const { deleteChannel, isPending: isDeletePending } = useDeleteChannel();
    const { removeChannel } = useMyChannels();
    const { toast } = useToast();

    const profile = useDynamicProfile();
    const { clearMessages } = useChatMessages(profile?.uid ?? null, channelId ?? null);

    const isOwner = channel?.ownerId === profile?.uid;
    const memberCount = membersTotal || channel?.memberNo || 0;

    const openDialog = (type: DialogType) => setActiveDialog(type);
    const closeDialog = () => setActiveDialog(null);

    const handleLeaveRoom = async () => {
        if (!channelId) return;

        try {
            await leaveRoom(channelId, profile?.uid);
            removeChannel(channelId); // Optimistic UI update
            await clearMessages();
            closeDialog();
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
            removeChannel(channelId); // Optimistic UI update
            closeDialog();
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
            <header className="flex h-[45px] items-center justify-between bg-background px-1.5">
                <button onClick={() => navigate(-1)} className="flex size-11 items-center justify-center rounded-full">
                    <ChevronLeft size={24} className="text-foreground" />
                </button>
                <h1 className="flex-1 text-center text-[16px] font-semibold leading-[26px] tracking-[0.08px] text-foreground">
                    {t('chat.settings.title')}
                </h1>
                <div className="size-11" />
            </header>

            {/* Content */}
            <div className="flex flex-col items-center gap-[25px] px-4 py-2.5">
                {/* Room Info */}
                <div className="flex flex-col items-center gap-[19px]">
                    {/* Room Icon & Name */}
                    <div className="flex flex-col items-center gap-2">
                        <ChatProfileIcon />
                        <div className="flex flex-col items-center gap-1">
                            <h2 className="text-[17px] font-semibold leading-[22px] tracking-[-0.34px] text-foreground">
                                {channel?.name || t('chat.settings.roomName')}
                            </h2>
                            {isOwner && (
                                <button
                                    onClick={() => openDialog('update')}
                                    className="text-[13px] font-medium leading-[1.3] text-primary underline"
                                >
                                    {t('chat.settings.edit')}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-start justify-center gap-6">
                        {isOwner && (
                            <ActionButton
                                icon={UserPlus}
                                label={t('chat.settings.inviteFriends')}
                                onClick={() => openDialog('invite')}
                            />
                        )}
                        <ActionButton icon={Bell} label={t('chat.settings.notifications')} />
                        {isOwner ? (
                            <ActionButton
                                icon={Trash2}
                                label={t('chat.settings.deleteRoom')}
                                onClick={() => openDialog('delete')}
                                variant="danger"
                            />
                        ) : (
                            <ActionButton
                                icon={LogOut}
                                label={t('chat.settings.leaveRoom')}
                                onClick={() => openDialog('leave')}
                            />
                        )}
                    </div>
                </div>

                {/* Members List */}
                <div className="flex w-full flex-col gap-[18px]">
                    <div className="flex items-center gap-1 px-[18px]">
                        <span className="text-[16px] font-semibold leading-[1.5] tracking-[-0.32px] text-foreground">
                            {t('chat.settings.roomMembers')}
                        </span>
                        <span className="text-[16px] font-semibold leading-[1.5] text-muted-foreground">
                            {memberCount}
                        </span>
                    </div>
                    <div className="flex flex-col gap-[14px] px-4">
                        {isMembersLoading ? (
                            <div className="py-4 text-center text-sm text-muted-foreground">
                                {t('chat.settings.loading')}
                            </div>
                        ) : members.length > 0 ? (
                            members.map(member => {
                                const memberId = member.id ?? '';
                                const memberName =
                                    member.$join?.nick || member.nick || memberId || t('chat.settings.unknownUser');

                                return (
                                    <MemberListItem
                                        key={memberId}
                                        member={{
                                            id: memberId,
                                            name: memberName,
                                            avatar: null,
                                        }}
                                        isMe={memberId === profile?.uid}
                                        isOwner={memberId === channel?.ownerId}
                                        isPendingInvite={member.$join?.joined === 0}
                                    />
                                );
                            })
                        ) : (
                            <div className="py-4 text-center text-sm text-muted-foreground">
                                {t('chat.settings.noMembers', '멤버가 없습니다')}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Dialogs */}
            <InviteFriendsDialog
                open={activeDialog === 'invite'}
                onOpenChange={open => (open ? openDialog('invite') : closeDialog())}
                channelId={channelId}
            />
            <UpdateChannelDialog
                open={activeDialog === 'update'}
                onOpenChange={open => (open ? openDialog('update') : closeDialog())}
                channelId={channelId}
            />
            <ConfirmDialog
                open={activeDialog === 'delete'}
                onOpenChange={open => (open ? openDialog('delete') : closeDialog())}
                title={t('chat.settings.deleteDialog.title')}
                description={t('chat.settings.deleteDialog.description')}
                confirmLabel={t('chat.settings.deleteDialog.confirm')}
                onConfirm={handleDeleteRoom}
                isPending={isDeletePending}
                variant="danger"
            />
            <ConfirmDialog
                open={activeDialog === 'leave'}
                onOpenChange={open => (open ? openDialog('leave') : closeDialog())}
                title={t('chat.settings.leaveDialog.title')}
                description={t('chat.settings.leaveDialog.description')}
                confirmLabel={t('chat.settings.leaveDialog.confirm')}
                onConfirm={handleLeaveRoom}
                isPending={isLeavePending}
                variant="warning"
            />
        </div>
    );
};
