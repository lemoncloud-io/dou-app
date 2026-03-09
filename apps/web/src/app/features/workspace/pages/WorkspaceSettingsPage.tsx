import { Bell, ChevronLeft, Crown, Lock, LogOut, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { InviteCodeCard } from '../components';

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
    { id: '4', name: '박준형', avatar: null, role: 'member', isMe: false },
];

export const WorkspaceSettingsPage = () => {
    const navigate = useNavigate();

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <header className="flex items-center justify-between border-b border-border px-4 pb-3 pt-3">
                <button onClick={() => navigate(-1)} className="p-1">
                    <ChevronLeft size={24} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">워크스페이스 설정</h1>
                <div className="w-8" />
            </header>

            <div className="space-y-6 px-5 pt-6">
                {/* WS Info */}
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
                        <span className="text-xl font-bold text-primary-foreground">S</span>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Sunny Place</h2>
                        <div className="mt-0.5 flex items-center gap-1.5">
                            <Lock size={12} className="text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">비공개 워크스페이스</span>
                        </div>
                    </div>
                </div>

                {/* Invite Code */}
                <InviteCodeCard code="WS7X9K" label="워크스페이스 초대 코드" />

                {/* Actions */}
                <div className="space-y-0">
                    <button className="flex w-full items-center gap-3.5 rounded-lg px-1 py-4 transition-colors active:bg-muted">
                        <Bell size={20} className="text-muted-foreground" />
                        <span className="text-[15px] text-foreground">알림 설정</span>
                    </button>
                    <button className="flex w-full items-center gap-3.5 rounded-lg px-1 py-4 transition-colors active:bg-muted">
                        <Settings size={20} className="text-muted-foreground" />
                        <span className="text-[15px] text-foreground">워크스페이스 편집</span>
                    </button>
                    <button className="flex w-full items-center gap-3.5 rounded-lg px-1 py-4 transition-colors active:bg-muted">
                        <LogOut size={20} className="text-destructive" />
                        <span className="text-[15px] text-destructive">워크스페이스 나가기</span>
                    </button>
                </div>

                <div className="h-px bg-border" />

                {/* Members */}
                <div>
                    <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                        멤버 <span>{mockMembers.length}</span>
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
        </div>
    );
};
