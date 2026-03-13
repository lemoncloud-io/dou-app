import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Bell, ChevronRight, Globe, LogOut, Moon, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useTheme } from '@chatic/theme';
import { Switch } from '@chatic/ui-kit/components/ui/switch';
import { useWebCoreStore } from '@chatic/web-core';

import { BottomNavigation } from '../../../shared/components/BottomNavigation';
import { LanguageSelectSheet } from '../components';

import type { LucideIcon } from 'lucide-react';

interface MenuItem {
    icon: LucideIcon;
    label: string;
    path?: string;
    toggle?: boolean;
    detail?: string;
}

export const MyPage = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const isGuest = useWebCoreStore(s => s.isGuest);
    const profile = useWebCoreStore(s => s.profile);
    const logout = useWebCoreStore(s => s.logout);
    const { setTheme, isDarkTheme } = useTheme();
    const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false);

    const currentLanguageLabel = t(`mypage.language.${i18n.language}`);

    const menuItems: MenuItem[] = [
        { icon: Bell, label: t('mypage.notifications'), path: '/notifications' },
        { icon: Settings, label: t('mypage.workspaceSettings'), path: '/workspace-list' },
        { icon: Moon, label: t('mypage.darkMode'), toggle: true },
        { icon: Globe, label: t('mypage.languageSettings'), detail: currentLanguageLabel },
    ];

    const handleThemeToggle = () => {
        setTheme(isDarkTheme ? 'light' : 'dark');
    };

    const handleLogout = () => {
        logout();
        window.location.href = '/auth/login';
    };

    const handleMenuClick = (item: MenuItem) => {
        if (item.toggle) {
            handleThemeToggle();
        } else if (item.icon === Globe) {
            setIsLanguageSheetOpen(true);
        } else if (item.path) {
            navigate(item.path);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-background py-safe-top">
            <header className="px-5 ">
                <h1 className="text-2xl font-extrabold text-foreground">{t('mypage.title')}</h1>
            </header>

            {/* Profile */}
            <div className="px-5 py-6">
                {isGuest ? (
                    <button onClick={() => navigate('/mypage/login')} className="flex flex-col gap-1.5 text-left">
                        <div className="flex items-center gap-1">
                            <span className="text-[22px] font-semibold ">{t('mypage.loginPrompt')}</span>
                            <ChevronRight size={18} className="text-foreground" />
                        </div>
                        <p className="text-[14.5px] font-medium text-muted-foreground">
                            {t('mypage.loginDescription')}
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
                            {t('mypage.edit')}
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
                        onClick={() => handleMenuClick(item)}
                        className="flex w-full items-center gap-3.5 rounded-lg px-1 py-4 transition-colors active:bg-muted"
                    >
                        <item.icon size={20} className="text-muted-foreground" />
                        <span className="flex-1 text-left text-[15px] text-foreground">{item.label}</span>
                        {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
                        {item.toggle ? (
                            <Switch checked={isDarkTheme} />
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
                        <span className="text-[15px] text-destructive">{t('mypage.logout')}</span>
                    </button>
                </div>
            )}

            {/* App version */}
            <div className="mt-auto px-5 pb-4">
                <p className="text-center text-xs text-muted-foreground">DoU v1.0.0</p>
            </div>
            <BottomNavigation />

            {/* Language Select Sheet */}
            <LanguageSelectSheet isOpen={isLanguageSheetOpen} onClose={() => setIsLanguageSheetOpen(false)} />
        </div>
    );
};
