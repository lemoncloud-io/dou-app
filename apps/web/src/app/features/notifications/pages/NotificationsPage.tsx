import { Bell, ChevronLeft, Megaphone, MessageSquare, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { LucideIcon } from 'lucide-react';

type NotifType = 'message' | 'invite' | 'system';

interface Notification {
    id: string;
    type: NotifType;
    title: string;
    body: string;
    time: string;
    isRead: boolean;
}

const mockNotifications: Notification[] = [
    {
        id: '1',
        type: 'message',
        title: '개발 모임방',
        body: '김민수: 내일 회의 있습니다!',
        time: '5분 전',
        isRead: false,
    },
    {
        id: '2',
        type: 'invite',
        title: '워크스페이스 초대',
        body: "'디자인 팀' 워크스페이스에 초대되었습니다.",
        time: '30분 전',
        isRead: false,
    },
    { id: '3', type: 'message', title: '일반 대화', body: '이지은: 확인했습니다 👍', time: '1시간 전', isRead: true },
    {
        id: '4',
        type: 'system',
        title: 'ENCL 공지',
        body: '앱이 v1.1.0으로 업데이트되었습니다.',
        time: '어제',
        isRead: true,
    },
    {
        id: '5',
        type: 'invite',
        title: '채팅방 초대',
        body: "'React 스터디' 방에 초대되었습니다.",
        time: '어제',
        isRead: true,
    },
    { id: '6', type: 'message', title: '공지사항', body: '새 규칙이 추가되었습니다.', time: '2일 전', isRead: true },
];

const typeIcon: Record<NotifType, LucideIcon> = {
    message: MessageSquare,
    invite: UserPlus,
    system: Megaphone,
};

const typeColor: Record<NotifType, string> = {
    message: 'bg-primary text-primary-foreground',
    invite: 'bg-accent text-accent-foreground',
    system: 'bg-muted text-muted-foreground',
};

export const NotificationsPage = () => {
    const navigate = useNavigate();

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-border px-4 pb-3 pt-3">
                <button onClick={() => navigate(-1)} className="p-1">
                    <ChevronLeft size={24} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">알림</h1>
                <button className="px-1 text-sm font-medium text-muted-foreground">모두 읽음</button>
            </header>

            {/* Notification List */}
            <div className="flex-1">
                {mockNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Bell size={48} className="mb-3 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">알림이 없습니다</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {mockNotifications.map(notif => {
                            const Icon = typeIcon[notif.type];
                            return (
                                <button
                                    key={notif.id}
                                    className={`flex w-full items-start gap-3.5 px-5 py-4 text-left transition-colors active:bg-muted ${
                                        !notif.isRead ? 'bg-accent/5' : ''
                                    }`}
                                >
                                    <div
                                        className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${typeColor[notif.type]}`}
                                    >
                                        <Icon size={18} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-[14px] font-semibold text-foreground">
                                                {notif.title}
                                            </span>
                                            {!notif.isRead && (
                                                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-badge-unread" />
                                            )}
                                        </div>
                                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                                            {notif.body}
                                        </p>
                                        <span className="mt-1 block text-[11px] text-muted-foreground">
                                            {notif.time}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
