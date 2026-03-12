import { Bell, ChevronRight, Globe, LogOut, MessageSquare, Moon, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { LucideIcon } from 'lucide-react';
import { useWebCoreStore } from '@chatic/web-core';
import { BottomNavigation } from '../../../shared/components/BottomNavigation';

interface MenuItem {
    icon: LucideIcon;
    label: string;
    path?: string;
    toggle?: boolean;
    detail?: string;
}

const menuItems: MenuItem[] = [
    { icon: Bell, label: '알림', path: '/notifications' },
    { icon: MessageSquare, label: '나와의 채팅 관리' },
    { icon: Settings, label: '워크스페이스 설정', path: '/workspace-list' },
    { icon: Moon, label: '다크 모드', toggle: true },
    { icon: Globe, label: '언어 설정', detail: '한국어' },
];

export const MyPage = () => {
    const navigate = useNavigate();
    const isGuest = useWebCoreStore(s => s.isGuest);
    const profile = useWebCoreStore(s => s.profile);

    const logout = useWebCoreStore(s => s.logout);

    const handleLogout = () => {
        logout();
        window.location.href = '/auth/login';
    };

    return (
        <div className="flex min-h-screen flex-col bg-background py-safe-top">
            <header className="px-5 ">
                <h1 className="text-2xl font-extrabold text-foreground">마이페이지</h1>
            </header>

            {/* Profile */}
            <div className="px-5 py-6">
                {isGuest ? (
                    <button onClick={() => navigate('/mypage/login')} className="flex flex-col gap-1.5 text-left">
                        <div className="flex items-center gap-1">
                            <span className="text-[22px] font-semibold ">로그인하기</span>
                            <ChevronRight size={18} className="text-[#3A3C40]" />
                        </div>
                        <p className="text-[14.5px] font-medium text-[#84888F]">
                            로그인 하고, 대화내용을 안전하게 관리하세요.
                        </p>
                    </button>
                ) : (
                    <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl">
                            <span role="img" aria-label="user">
                                👤
                            </span>
                        </div>
                        <div className="flex-1">
                            <h2 className="text-lg font-bold text-foreground">{profile?.$user?.name}</h2>
                            <p className="text-sm text-muted-foreground">{profile?.$user?.email}</p>
                        </div>
                        <button
                            onClick={() => navigate('/profile/edit')}
                            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors active:bg-muted"
                        >
                            편집
                        </button>
                    </div>
                )}
            </div>

            <div className="mx-5 h-px bg-border" />

            {/* Menu */}
            <div className="px-5 py-2">
                {menuItems.map((item, i) => (
                    <button
                        key={i}
                        onClick={() => item.path && navigate(item.path)}
                        className="flex w-full items-center gap-3.5 rounded-lg px-1 py-4 transition-colors active:bg-muted"
                    >
                        <item.icon size={20} className="text-muted-foreground" />
                        <span className="flex-1 text-left text-[15px] text-foreground">{item.label}</span>
                        {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
                        {item.toggle ? (
                            <div className="relative h-6 w-11 rounded-full bg-muted">
                                <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-sm" />
                            </div>
                        ) : (
                            <ChevronRight size={18} className="text-muted-foreground" />
                        )}
                    </button>
                ))}
            </div>

            <div className="mx-5 h-px bg-border" />

            {/* Logout */}
            {!isGuest && (
                <div className="px-5 py-2">
                    <button onClick={handleLogout} className="flex w-full items-center gap-3.5 px-1 py-4">
                        <LogOut size={20} className="text-destructive" />
                        <span className="text-[15px] text-destructive">로그아웃</span>
                    </button>
                </div>
            )}

            {/* App version */}
            <div className="mt-auto px-5 pb-4">
                <p className="text-center text-xs text-muted-foreground">DuO v1.0.0</p>
            </div>
            <BottomNavigation />
        </div>
    );
};
