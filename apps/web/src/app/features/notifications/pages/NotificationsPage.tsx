import { Bell, ChevronLeft, Megaphone, MessageSquare, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

// TODO: Replace with actual notifications from API
const notifications: Notification[] = [];

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
    const { t } = useTranslation();

    return (
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            {/* Header */}
            <header className="flex items-center justify-center px-4 py-3">
                <button onClick={() => navigate(-1)} className="absolute left-4 p-2">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">{t('notifications.title')}</h1>
                <button className="px-1 text-sm font-medium text-muted-foreground">
                    {t('notifications.markAllRead')}
                </button>
            </header>

            {/* Notification List */}
            <div className="flex-1">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Bell size={48} className="mb-3 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{t('notifications.empty')}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {notifications.map(notif => {
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
