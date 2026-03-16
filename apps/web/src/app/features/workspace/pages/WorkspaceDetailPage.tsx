import { ChevronLeft, Globe, Lock, Plus, Settings, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

interface RoomListItemProps {
    room: {
        id: string;
        name: string;
        visibility: 'public' | 'private';
        memberCount: number;
        lastMsg: string;
        time: string;
        unread: number;
    };
    onClick: () => void;
}

const RoomListItem = ({ room, onClick }: RoomListItemProps) => {
    return (
        <button
            onClick={onClick}
            className="flex w-full items-center gap-3 rounded-lg px-1 py-3.5 text-left transition-colors active:bg-muted"
        >
            <div className="relative flex-shrink-0">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                    <span className="text-lg text-muted-foreground">💬</span>
                </div>
                <span className="absolute -left-1 -top-1 flex h-4 w-7 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                    {room.memberCount}
                </span>
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-foreground">{room.name}</span>
                    {room.visibility === 'private' ? (
                        <Lock size={11} className="flex-shrink-0 text-muted-foreground" />
                    ) : (
                        <Globe size={11} className="flex-shrink-0 text-muted-foreground" />
                    )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{room.lastMsg}</p>
            </div>

            <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className="text-[11px] text-muted-foreground">{room.time}</span>
                {room.unread > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-badge-unread px-1.5 text-[11px] font-bold text-badge-unread-foreground">
                        {room.unread}
                    </span>
                )}
            </div>
        </button>
    );
};

const mockWorkspaceDetail = {
    id: '1',
    name: 'Sunny Place',
    image: null,
    isDefault: true,
    visibility: 'private' as const,
    memberCount: 42,
    inviteCode: 'WS7X9K',
};

const mockRooms = [
    {
        id: '1',
        name: '개발 모임방',
        visibility: 'private' as const,
        memberCount: 100,
        lastMsg: 'Lorem ipsum dolor sit amet',
        time: '오후 14:22',
        unread: 3,
    },
    {
        id: '2',
        name: '일반 대화',
        visibility: 'public' as const,
        memberCount: 42,
        lastMsg: '다음 주에 봐요~',
        time: '오후 18:30',
        unread: 0,
    },
    {
        id: '3',
        name: '공지사항',
        visibility: 'private' as const,
        memberCount: 42,
        lastMsg: '새 규칙이 추가되었습니다.',
        time: '오전 09:15',
        unread: 1,
    },
];

export const WorkspaceDetailPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    // TODO: wsId will be used when fetching real workspace data from API
    const { wsId } = useParams();

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <header className="flex items-center justify-center px-4 py-3">
                <button onClick={() => navigate(-1)} className="absolute left-4 p-2">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">{mockWorkspaceDetail.name}</h1>
                <button onClick={() => navigate(`/workspace/${wsId}/settings`)} className="absolute right-4 p-2">
                    <Settings size={20} className="text-foreground" />
                </button>
            </header>

            {/* Workspace Info Card */}
            <div className="px-5 pb-4 pt-5">
                <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-primary">
                        <span className="text-2xl font-bold text-primary-foreground">S</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-bold text-foreground">{mockWorkspaceDetail.name}</h2>
                        <div className="mt-1 flex items-center gap-3">
                            <div className="flex items-center gap-1">
                                {mockWorkspaceDetail.visibility === 'private' ? (
                                    <Lock size={12} className="text-muted-foreground" />
                                ) : (
                                    <Globe size={12} className="text-muted-foreground" />
                                )}
                                <span className="text-xs text-muted-foreground">
                                    {mockWorkspaceDetail.visibility === 'private'
                                        ? t('workspace.detail.private')
                                        : t('workspace.detail.public')}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Users size={12} className="text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                    {t('workspace.detail.members', { count: mockWorkspaceDetail.memberCount })}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mx-5 h-px bg-border" />

            {/* Room List */}
            <section className="flex-1 px-5 pt-4">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-foreground">{t('workspace.detail.chatRooms')}</h3>
                    <button
                        onClick={() => navigate('/create-room')}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border"
                    >
                        <Plus size={18} className="text-foreground" />
                    </button>
                </div>

                <div className="space-y-0">
                    {mockRooms.map(room => (
                        <RoomListItem key={room.id} room={room} onClick={() => navigate(`/room/${room.id}`)} />
                    ))}
                </div>
            </section>
        </div>
    );
};
